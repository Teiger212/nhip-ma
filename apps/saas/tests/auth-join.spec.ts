import { test as base, expect, request } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import {
	WALK_ADMIN_EMAIL,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
	WALK_USER_PASSWORD,
} from "../modules/inbox/lib/walk-user";

/** The seed gives both logins the same password (docs/e2e-scenarios.md, "Seed"). */
const SEED_PASSWORD = WALK_USER_PASSWORD;
const INVITEE_PASSWORD = "E2e-Passw0rd!";

// The sign-up password input has no accessible name (its "Password" label is not associated),
// so it is found by its semantic autocomplete attribute.
const NEW_PASSWORD_INPUT = 'input[autocomplete="new-password"]';

type Office = { id: string; name: string };

/**
 * What the platform admin sets up for one test, the way a person can (ADR 0010): create an
 * office, invite into it. Everything created is removed afterwards: pending invitations
 * cancelled, offices deleted (ADR 0013 deletes their non-admin members with them), and any
 * invitee account left without an office removed through the admin's "Remove user".
 */
type Nhip = {
	admin: APIRequestContext;
	createOffice: (label: string) => Promise<Office>;
	invite: (officeId: string, email: string) => Promise<string>;
	newEmail: (label: string) => string;
};

/** Better Auth refuses cookie-bearing writes without an Origin; every request carries one. */
function apiContext(baseURL: string) {
	return request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
}

async function signIn(api: APIRequestContext, email: string, password: string) {
	const res = await api.post("/api/auth/sign-in/email", { data: { email, password } });
	expect(res.ok(), `sign in as ${email}`).toBe(true);
}

const test = base.extend<{ nhip: Nhip }>({
	nhip: async ({ baseURL }, use) => {
		const origin = baseURL ?? "";
		const admin = await apiContext(origin);
		await signIn(admin, WALK_ADMIN_EMAIL, SEED_PASSWORD);

		const offices: string[] = [];
		const invitations: string[] = [];
		const emails: string[] = [];

		await use({
			admin,
			newEmail: (label) => {
				const email = `e2e-${label}-${test.info().testId}-${Date.now()}@e2e.nhip.test`;
				emails.push(email);
				return email;
			},
			createOffice: async (label) => {
				const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
				const name = `E2E ${label} ${stamp}`;
				const res = await admin.post("/api/auth/organization/create", {
					data: { name, slug: `e2e-${label.toLowerCase().replace(/\W+/g, "-")}-${stamp}` },
				});
				expect(res.ok(), "the platform admin creates an office").toBe(true);
				const { id } = (await res.json()) as { id: string };
				offices.push(id);
				return { id, name };
			},
			invite: async (officeId, email) => {
				const res = await admin.post("/api/auth/organization/invite-member", {
					data: { email, role: "member", organizationId: officeId },
				});
				expect(res.ok(), "the platform admin invites into the office").toBe(true);
				const { id } = (await res.json()) as { id: string };
				invitations.push(id);
				return id;
			},
		});

		// Accepted invitations cannot be cancelled; that refusal is fine here.
		for (const invitationId of invitations) {
			await admin.post("/api/auth/organization/cancel-invitation", { data: { invitationId } });
		}
		for (const organizationId of offices) {
			await admin.post("/api/auth/organization/delete", { data: { organizationId } });
		}
		for (const email of emails) {
			const res = await admin.get("/api/auth/admin/list-users", {
				params: { searchValue: email, searchField: "email" },
			});
			const { users } = (await res.json()) as { users: { id: string; email: string }[] };
			for (const user of users.filter((u) => u.email === email)) {
				await admin.post("/api/auth/admin/remove-user", { data: { userId: user.id } });
			}
		}
		await admin.dispose();
	},
});

/** The link the invitation email carries (the unprefixed path; the app adds the locale). */
function invitationLink(invitationId: string, email: string) {
	return `/signup?invitationId=${invitationId}&email=${encodeURIComponent(email)}`;
}

/**
 * The invitee opens the email's link and creates their account. With `acceptFails`, the
 * browser's accept request never reaches the server (a dropped connection), which leaves an
 * account with its invitations still pending.
 */
async function signUpByInvitationLink(
	page: Page,
	invitationId: string,
	email: string,
	{ acceptFails = false } = {},
) {
	const acceptRoute = "**/api/auth/organization/accept-invitation";
	if (acceptFails) {
		await page.route(acceptRoute, (route) => route.abort());
	}
	// The page accepts the invitation right after sign-up; wait for that to finish (or fail).
	const acceptDone = acceptFails
		? page.waitForEvent("requestfailed", (r) => r.url().includes("/accept-invitation"))
		: page.waitForResponse((r) => r.url().includes("/accept-invitation"));

	await page.goto(invitationLink(invitationId, email));
	await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(email);
	await page.getByRole("textbox", { name: "Name" }).fill("E2E Invitee");
	await page.locator(NEW_PASSWORD_INPUT).fill(INVITEE_PASSWORD);

	const signUp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-up/email"));
	await page.getByRole("button", { name: "Create account" }).click();
	const signedUp = await signUp;
	expect(
		signedUp.ok(),
		`sign-up through the invitation link succeeds (${signedUp.status()} ${await signedUp.text()})`,
	).toBe(true);

	await acceptDone;
	if (acceptFails) {
		await page.unroute(acceptRoute);
	}
}

/**
 * Open the inbox as a fresh account. The kit's first-run step (name, avatar) stands between
 * a new account and the inbox; the person clicks Continue.
 */
async function openInboxAsNewAccount(page: Page) {
	await page.goto("/en/inbox");
	await expect(page).toHaveURL(/\/en\/onboarding/);
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(page).toHaveURL(/\/en\/inbox/);
}

/**
 * The inbox works for this account: an office's (empty) thread list, not the refusal an
 * account without an office, or with two, gets (ADR 0010: `no_office`, `ambiguous_office`).
 */
async function expectInboxLoads(page: Page) {
	await expect(page.getByRole("button", { name: /Your turn/ })).toBeVisible();
	await expect(page.getByText("No conversations.")).toBeVisible();
	await expect(page.getByText("Could not load conversations.")).toHaveCount(0);
}

/** The offices the signed-in account belongs to (the kit's organization list). */
async function officesOf(page: Page): Promise<Office[]> {
	const res = await page.request.get("/api/auth/organization/list");
	expect(res.ok()).toBe(true);
	return (await res.json()) as Office[];
}

/** The office's members as the platform admin sees them. */
async function memberEmails(admin: APIRequestContext, officeId: string) {
	const res = await admin.get("/api/auth/organization/list-members", {
		params: { organizationId: officeId },
	});
	expect(res.ok()).toBe(true);
	const { members } = (await res.json()) as { members: { user: { email: string } }[] };
	return members.map((m) => m.user.email);
}

/** The office is still there, as the platform admin sees it. */
async function expectOfficeExists(admin: APIRequestContext, office: Office) {
	const res = await admin.get("/api/auth/organization/get-full-organization", {
		params: { organizationId: office.id },
	});
	expect(res.ok()).toBe(true);
	expect(await res.json()).toMatchObject({ id: office.id, name: office.name });
}

// scenario: docs/e2e-scenarios.md Auth 1
test.describe("Auth 1 — an invitee joins", () => {
	test("opening the invitation link and signing up signs the invitee in and lands them in the office", async ({
		page,
		nhip,
	}) => {
		const office = await nhip.createOffice("Auth 1");
		const email = nhip.newEmail("join");
		const invitationId = await nhip.invite(office.id, email);

		await signUpByInvitationLink(page, invitationId, email);

		// Signed in: sign-up leads straight into the app's first-run step, a signed-in page.
		await expect(page).toHaveURL(/\/en\/onboarding/);
		const session = await page.request.get("/api/auth/get-session");
		expect(await session.json()).toMatchObject({ user: { email, emailVerified: true } });

		await page.getByRole("button", { name: "Continue" }).click();
		await expect(page).toHaveURL(/\/en\/inbox/);
		await expectInboxLoads(page);

		// In the office it was invited to, and only that one.
		expect(await officesOf(page)).toEqual([
			expect.objectContaining({ id: office.id, name: office.name }),
		]);
		expect(await memberEmails(nhip.admin, office.id)).toContain(email);
	});
});

// scenario: docs/e2e-scenarios.md Auth 5
test.describe("Auth 5 — one office, even at once", () => {
	test("accepting two offices' invitations at the same moment ends in exactly one office", async ({
		page,
		nhip,
	}) => {
		const first = await nhip.createOffice("Auth 5 A");
		const second = await nhip.createOffice("Auth 5 B");
		const email = nhip.newEmail("race");
		const firstInvitation = await nhip.invite(first.id, email);
		const secondInvitation = await nhip.invite(second.id, email);

		// An account whose invitations are both still pending: it signed up through the first
		// link, but its browser's accept never arrived.
		await signUpByInvitationLink(page, firstInvitation, email, { acceptFails: true });
		expect(await officesOf(page), "no office before the race").toEqual([]);

		const accept = (invitationId: string) =>
			page.request.post("/api/auth/organization/accept-invitation", {
				data: { invitationId },
				headers: { origin: new URL(page.url()).origin },
			});
		const [toFirst, toSecond] = await Promise.all([
			accept(firstInvitation),
			accept(secondInvitation),
		]);

		// What the person ends with: exactly one of the two offices, and the inbox works there.
		const offices = await officesOf(page);
		expect(offices, "the account ends in exactly one office").toHaveLength(1);
		expect([first.id, second.id]).toContain(offices[0].id);
		const joined = offices[0].id === first.id ? first : second;
		const notJoined = joined === first ? second : first;

		await openInboxAsNewAccount(page);
		await expectInboxLoads(page);

		// The other office is not theirs.
		expect(await memberEmails(nhip.admin, notJoined.id)).not.toContain(email);
		expect(await memberEmails(nhip.admin, joined.id)).toContain(email);

		// And the answers told the truth: the office they are in accepted them, the other one
		// refused with the one-office rule.
		const answerFrom = (office: Office) => (office === first ? toFirst : toSecond);
		expect(answerFrom(joined).ok(), "the accept into their office succeeds").toBe(true);
		const refusal = answerFrom(notJoined);
		expect(refusal.ok(), "the accept into the other office is refused").toBe(false);
		expect(await refusal.text()).toContain("ONE_OFFICE_PER_OPERATOR");
	});
});

// scenario: docs/e2e-scenarios.md Auth 6
test.describe("Auth 6 — deleting an office needs permission first", () => {
	test("a delete request from someone not signed in is refused and the office stays", async ({
		baseURL,
		nhip,
	}) => {
		const office = await nhip.createOffice("Auth 6 anon");

		const anonymous = await apiContext(baseURL ?? "");
		const res = await anonymous.post("/api/auth/organization/delete", {
			data: { organizationId: office.id },
		});
		await anonymous.dispose();

		expect(res.status(), "refused as not signed in").toBe(401);
		await expectOfficeExists(nhip.admin, office);
	});

	test("a delete request from a member who is not the owner is refused and the office stays", async ({
		page,
		nhip,
	}) => {
		const office = await nhip.createOffice("Auth 6 member");
		const email = nhip.newEmail("member");
		await signUpByInvitationLink(page, await nhip.invite(office.id, email), email);
		expect(await officesOf(page)).toEqual([expect.objectContaining({ id: office.id })]);

		const res = await page.request.post("/api/auth/organization/delete", {
			data: { organizationId: office.id },
			headers: { origin: new URL(page.url()).origin },
		});

		expect(res.status(), "refused for lack of permission").toBe(403);
		await expectOfficeExists(nhip.admin, office);
		// The member is still in it: had the office gone, ADR 0013 would have taken the
		// account with it.
		expect(await memberEmails(nhip.admin, office.id)).toContain(email);
		await openInboxAsNewAccount(page);
		await expectInboxLoads(page);
	});
});

// scenario: docs/e2e-scenarios.md Auth 7
test.describe("Auth 7 — only a manager replaces the logo", () => {
	test("a member asking for the office's logo upload URL is refused", async ({ baseURL }) => {
		const agent = await apiContext(baseURL ?? "");
		await signIn(agent, WALK_USER_EMAIL, SEED_PASSWORD);

		// The agent is a plain member of the walk office (ADR 0010 seed).
		const res = await agent.post("/api/rpc/organizations/createLogoUploadUrl", {
			data: { json: { organizationId: WALK_OFFICE_ID } },
		});
		const body = await res.text();
		await agent.dispose();

		expect(res.status()).toBe(403);
		expect(body).not.toContain("signedUploadUrl");
	});
});
