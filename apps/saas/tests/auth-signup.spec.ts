import { expect, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";

// Seed logins (apps/saas/modules/inbox/lib/walk-user.ts, docs/e2e-scenarios.md).
const AGENT = { email: "walk@nhip.local", password: "walkthrough" };
const PLATFORM_ADMIN = { email: "admin@nhip.local", password: "walkthrough" };
const WALK_OFFICE_ID = "walk-office";

// Each test signs in two people (an admin and an agent or attacker) and drives several pages;
// against the dev server under parallel load that outgrows the 30 s default.
test.describe.configure({ timeout: 90_000 });

/** A password that passes the sign-up form's rules, so a refusal is never about the password. */
const ATTACKER_PASSWORD = "Str0ng!Passw0rd-e2e";

function uniqueEmail(tag: string): string {
	return `e2e-${tag}-${test.info().testId}-${Date.now()}@e2e.nhip.test`;
}

/** Signs in through the login page, as a person would. */
async function signIn(page: Page, email: string, password: string) {
	await page.goto("/en/login");
	await page.getByRole("tab", { name: "Password" }).click();
	await page.getByRole("textbox", { name: "Email" }).fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	const answered = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
	await page.getByRole("button", { name: "Sign in" }).click();
	await answered;
}

/** Signed in: the login page lets go (the first visit to the app compiles slowly in dev). */
async function expectSignedIn(page: Page) {
	await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Nobody is signed in on this page: the inbox asks for a login (AGENTS.md: no bypass route). */
async function expectSignedOut(page: Page) {
	await page.goto("/en/inbox");
	await expect(page).toHaveURL(/\/en\/login/);
}

/** Signing in with these credentials is refused: the form says so and stays on the login page. */
async function expectCannotSignIn(page: Page, email: string, password: string) {
	await signIn(page, email, password);
	await expect(page.getByText("The credentials you entered are invalid")).toBeVisible();
	await expect(page).toHaveURL(/\/en\/login/);
	await expectSignedOut(page);
}

/**
 * The platform admin, signed in through the login page in a context of their own. Their
 * requests carry the app's origin, as the admin area's own calls do.
 */
async function signInAsAdmin(browser: Browser, baseURL: string | undefined) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, PLATFORM_ADMIN.email, PLATFORM_ADMIN.password);
	await expectSignedIn(page);
	const origin = new URL(baseURL ?? "http://localhost:3000").origin;
	return { context, page, api: context.request, origin };
}

type Admin = Awaited<ReturnType<typeof signInAsAdmin>>;

/** The admin invites an email into the walk office through the app's organization API. */
async function invite(admin: Admin, email: string): Promise<string> {
	const response = await admin.api.post("/api/auth/organization/invite-member", {
		headers: { origin: admin.origin },
		data: { email, role: "member", organizationId: WALK_OFFICE_ID },
	});
	expect(response.ok(), await response.text()).toBe(true);
	const invitation = (await response.json()) as { id: string };
	return invitation.id;
}

async function cancelInvitation(admin: Admin, invitationId: string) {
	await admin.api.post("/api/auth/organization/cancel-invitation", {
		headers: { origin: admin.origin },
		data: { invitationId },
	});
}

/** The admin lists load after the page and again after each search; the dev server is slow. */
const ADMIN_LIST = { timeout: 20_000 };

/**
 * What the platform admin sees under Admin → Users when searching for this email: the
 * person-visible proof that an account exists or not.
 */
async function expectNoAccountInAdmin(admin: Admin, email: string) {
	await admin.page.goto("/en/admin/users");
	await admin.page.getByRole("searchbox").fill(email);
	await expect(admin.page.getByText("No results.")).toBeVisible(ADMIN_LIST);
	await expect(admin.page.getByText(email)).toHaveCount(0);
}

/** Safety net: removes any account a failing run created, so no stray login survives. */
async function removeAccountIfAny(admin: Admin, email: string) {
	const response = await admin.api.get("/api/auth/admin/list-users", {
		params: { searchValue: email, searchField: "email" },
	});
	if (!response.ok()) {
		return;
	}
	const { users } = (await response.json()) as { users: { id: string; email: string }[] };
	for (const user of users.filter((u) => u.email === email)) {
		await admin.api.post("/api/auth/admin/remove-user", {
			headers: { origin: admin.origin },
			data: { userId: user.id },
		});
	}
}

// scenario: docs/e2e-scenarios.md Auth 2
test.describe("Auth 2 — registering someone else's invited email fails", () => {
	let admin: Admin;
	const invitations: string[] = [];
	const emails: string[] = [];

	test.beforeEach(async ({ browser, baseURL }) => {
		admin = await signInAsAdmin(browser, baseURL);
	});

	test.afterEach(async () => {
		for (const id of invitations.splice(0)) {
			await cancelInvitation(admin, id);
		}
		for (const email of emails.splice(0)) {
			await removeAccountIfAny(admin, email);
		}
		await admin.context.close();
	});

	test("an invited email signed up without the invitation link gets no account and no session", async ({
		page,
		baseURL,
	}) => {
		const invitee = uniqueEmail("invitee");
		emails.push(invitee);
		invitations.push(await invite(admin, invitee));

		// Without the link there is no sign-up form (public sign-up is closed), so the attacker
		// posts to the sign-up endpoint the form uses, with the invitee's email.
		const attempt = await page.request.post("/api/auth/sign-up/email", {
			headers: { origin: new URL(baseURL ?? "http://localhost:3000").origin },
			data: { email: invitee, password: ATTACKER_PASSWORD, name: "Not the invitee" },
		});
		expect(attempt.ok()).toBe(false);

		await expectSignedOut(page);
		await expectCannotSignIn(page, invitee, ATTACKER_PASSWORD);
		await expectNoAccountInAdmin(admin, invitee);
	});

	test("someone else's invitation link does not register the invited email", async ({ page }) => {
		const invitee = uniqueEmail("invitee");
		const holder = uniqueEmail("holder");
		emails.push(invitee, holder);
		invitations.push(await invite(admin, invitee));
		const holderInvitation = await invite(admin, holder);
		invitations.push(holderInvitation);

		// The holder's own link, opened in a browser; the form shows the holder's email, locked.
		await page.goto(`/en/signup?invitationId=${holderInvitation}`);
		const email = page.getByRole("textbox", { name: "Email" });
		await expect(email).toHaveValue(holder);

		// A person in the browser unlocks the field and types the invitee's email instead.
		await email.evaluate((input) => input.removeAttribute("readonly"));
		await email.fill(invitee);
		await page.getByRole("textbox", { name: "Name" }).fill("Not the invitee");
		// The sign-up form's "Password" label does not name its field (unlike the login page's),
		// so the field is found by its form name.
		await page.locator('input[name="password"]').fill(ATTACKER_PASSWORD);
		const signUp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-up/"));
		await page.getByRole("button", { name: "Create account" }).click();
		await signUp;

		await expectSignedOut(page);
		await expectCannotSignIn(page, invitee, ATTACKER_PASSWORD);
		await expectNoAccountInAdmin(admin, invitee);
	});

	test("a cancelled invitation link registers nobody", async ({ page, baseURL }) => {
		const invitee = uniqueEmail("cancelled");
		emails.push(invitee);
		const invitation = await invite(admin, invitee);
		await cancelInvitation(admin, invitation);

		// Opened in a browser, the cancelled link offers no sign-up form, only the login page.
		await page.goto(`/en/signup?invitationId=${invitation}`);
		await expect(page).toHaveURL(/\/en\/login/);
		await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);

		// Replaying the sign-up the invitation form sends (its invitation id travels in the
		// x-invitation-id header and the callback URL, as seen in the form's own request).
		const attempt = await page.request.post("/api/auth/sign-up/email", {
			headers: {
				origin: new URL(baseURL ?? "http://localhost:3000").origin,
				"x-invitation-id": invitation,
			},
			data: {
				email: invitee,
				password: ATTACKER_PASSWORD,
				name: "Cancelled invitee",
				callbackURL: `/organization-invitation/${invitation}`,
			},
		});
		expect(attempt.ok()).toBe(false);

		await expectSignedOut(page);
		await expectCannotSignIn(page, invitee, ATTACKER_PASSWORD);
		await expectNoAccountInAdmin(admin, invitee);
	});

	// An invitation expires 48 hours after it is sent. Nothing a person can do makes one expire
	// sooner, and specs do not write to the database, so the expired case is not driven here.
	test.fixme("an expired invitation link registers nobody", async () => {});
});

// scenario: docs/e2e-scenarios.md Auth 3
test.describe("Auth 3 — no account without an invitation", () => {
	test("a magic link asked for an email with no account creates nothing", async ({
		page,
		browser,
		baseURL,
	}) => {
		const stranger = uniqueEmail("stranger");

		await page.goto("/en/login");
		await page.getByRole("tab", { name: "Magic link" }).click();
		await page.getByRole("textbox", { name: "Email" }).fill(stranger);
		await page.getByRole("button", { name: "Send magic link" }).click();
		await expect(page.getByText("Link sent")).toBeVisible();

		await expectSignedOut(page);

		const admin = await signInAsAdmin(browser, baseURL);
		try {
			await expectNoAccountInAdmin(admin, stranger);
		} finally {
			await removeAccountIfAny(admin, stranger);
			await admin.context.close();
		}
	});

	test.skip("Google or GitHub sign-in for an email with no account creates nothing", () => {
		// OAuth providers are not configured locally or in the E2E profile.
	});
});

/** The agent, signed in through the login page. */
async function signInAsAgent(page: Page) {
	await signIn(page, AGENT.email, AGENT.password);
	await expectSignedIn(page);
}

async function createOffice(api: APIRequestContext, origin: string, name: string) {
	return api.post("/api/auth/organization/create", {
		headers: { origin },
		data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
	});
}

/** What the platform admin sees under Admin → Organizations when searching for a name. */
async function adminOfficeSearch(admin: Admin, name: string) {
	await admin.page.goto("/en/admin/organizations");
	await admin.page.getByRole("searchbox").fill(name);
	return admin.page.getByText(name, { exact: true });
}

// scenario: docs/e2e-scenarios.md Auth 4
test.describe("Auth 4 — only the platform admin creates offices", () => {
	test("an agent creating an office is refused; the platform admin succeeds", async ({
		page,
		browser,
		baseURL,
	}) => {
		const origin = new URL(baseURL ?? "http://localhost:3000").origin;
		const agentOffice = `E2E agent office ${test.info().testId} ${Date.now()}`;
		const adminOffice = `E2E admin office ${test.info().testId} ${Date.now()}`;

		await signInAsAgent(page);
		const refused = await createOffice(page.request, origin, agentOffice);
		// Should the refusal ever regress, the office it made is still cleaned up below.
		const leakedId = refused.ok() ? ((await refused.json()) as { id: string }).id : undefined;

		const admin = await signInAsAdmin(browser, baseURL);
		let createdId: string | undefined;
		try {
			expect(refused.status()).toBe(403);

			const agentOfficeRow = await adminOfficeSearch(admin, agentOffice);
			await expect(admin.page.getByText("No results.")).toBeVisible(ADMIN_LIST);
			await expect(agentOfficeRow).toHaveCount(0);

			const created = await createOffice(admin.api, admin.origin, adminOffice);
			expect(created.status()).toBe(200);
			createdId = ((await created.json()) as { id: string }).id;

			await expect(await adminOfficeSearch(admin, adminOffice)).toBeVisible(ADMIN_LIST);
		} finally {
			if (leakedId) {
				// The agent owns it, not the admin: the agent deletes it.
				await page.request.post("/api/auth/organization/delete", {
					headers: { origin },
					data: { organizationId: leakedId },
				});
			}
			if (createdId) {
				await admin.api.post("/api/auth/organization/delete", {
					headers: { origin: admin.origin },
					data: { organizationId: createdId },
				});
			}
			await admin.context.close();
		}
	});
});
