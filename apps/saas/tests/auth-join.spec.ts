import type { Admin } from "./support/fixtures";
import { expect, test } from "./support/fixtures";
import {
	expectInboxLoads,
	newcomer,
	openInboxAsNewAccount,
	signUpByInvitationLink,
} from "./support/invitee";
import type { Office } from "./support/offices";
import { acceptInvitation, deleteOffice, officesOf } from "./support/offices";
import { AGENT, PLATFORM_ADMIN, DEMO_OFFICE_ID } from "./support/seed";
import { apiAs, withOrigin } from "./support/session";

// scenario: docs/e2e-scenarios.md Auth 1
test.describe("Auth 1 — an invitee joins", () => {
	test("opening the invitation link and signing up signs the invitee in and lands them in the office", async ({
		page,
		admin,
	}) => {
		const office = await admin.createOffice("Auth 1");
		const email = admin.newEmail("join");
		const invitationId = await admin.invite(email, office.id);

		await signUpByInvitationLink(page, invitationId, email);

		// Signed in: sign-up leads straight into the app's first-run step, a signed-in page.
		await expect(page).toHaveURL(/\/en\/onboarding/);
		const session = await page.request.get("/api/auth/get-session");
		expect(await session.json()).toMatchObject({ user: { email, emailVerified: true } });

		await page.getByTestId("onboarding-continue").click();
		await expect(page).toHaveURL(/\/en\/inbox/);
		await expectInboxLoads(page);

		// In the office it was invited to, and only that one.
		expect(await officesOf(page)).toEqual([
			expect.objectContaining({ id: office.id, name: office.name }),
		]);
		expect(await admin.memberEmails(office.id)).toContain(email);
	});
});

// scenario: docs/e2e-scenarios.md Auth 5
test.describe("Auth 5 — one office, even at once", () => {
	test("accepting two offices' invitations at the same moment ends in exactly one office", async ({
		page,
		admin,
	}) => {
		const first = await admin.createOffice("Auth 5 A");
		const second = await admin.createOffice("Auth 5 B");
		const email = admin.newEmail("race");
		const firstInvitation = await admin.invite(email, first.id);
		const secondInvitation = await admin.invite(email, second.id);

		// An account whose invitations are both still pending: it signed up through the first
		// link, but its browser's accept never arrived.
		await signUpByInvitationLink(page, firstInvitation, email, { acceptFails: true });
		expect(await officesOf(page), "no office before the race").toEqual([]);

		const [toFirst, toSecond] = await Promise.all([
			acceptInvitation(page, firstInvitation),
			acceptInvitation(page, secondInvitation),
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
		expect(await admin.memberEmails(notJoined.id)).not.toContain(email);
		expect(await admin.memberEmails(joined.id)).toContain(email);

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
		admin,
	}) => {
		const office = await admin.createOffice("Auth 6 anon");

		const anonymous = await apiAs();
		const res = await deleteOffice(anonymous, office.id);
		await anonymous.dispose();

		expect(res.status(), "refused as not signed in").toBe(401);
		await admin.expectOfficeExists(office);
	});

	test("a delete request from a member who is not the owner is refused and the office stays", async ({
		page,
		admin,
	}) => {
		const office = await admin.createOffice("Auth 6 member");
		const email = admin.newEmail("member");
		await signUpByInvitationLink(page, await admin.invite(email, office.id), email);
		expect(await officesOf(page)).toEqual([expect.objectContaining({ id: office.id })]);

		const res = await deleteOffice(withOrigin(page.request), office.id);

		expect(res.status(), "refused for lack of permission").toBe(403);
		await admin.expectOfficeExists(office);
		// The member is still in it: had the office gone, ADR 0013 would have taken the
		// account with it.
		expect(await admin.memberEmails(office.id)).toContain(email);
		await openInboxAsNewAccount(page);
		await expectInboxLoads(page);
	});

	// #185, ADR 0015: the kit's `owner` role makes a manager, not someone who ends the office.
	test("a manager holding the kit's owner role asking to delete the office is refused and the office stays", async ({
		browser,
		admin,
	}) => {
		test.slow();
		// An office of the test's own: a red run really deletes it, and with it its members'
		// accounts (ADR 0013).
		const office = await admin.createOffice("Auth 6 owner");
		const owners: string[] = [];
		try {
			const manager = await newcomer(browser, admin, office, "auth6-owner", "owner", owners);
			try {
				// The precondition: the manager is in the office, holding the kit's owner role, as
				// does the platform admin who created it.
				expect(await officesOf(manager.page)).toEqual([expect.objectContaining({ id: office.id })]);
				const before = await rolesIn(admin, office);
				expect(before[manager.email], "the manager holds the kit's owner role").toBe("owner");
				expect(before[PLATFORM_ADMIN.email], "the platform admin is the office's kit owner").toBe(
					"owner",
				);

				const res = await deleteOffice(manager.api, office.id);

				expect(res.status(), "refused: only the platform admin deletes an office").toBe(403);
				expect(await res.text()).toContain("OFFICE_DELETE_PLATFORM_ADMIN_ONLY");
				await admin.expectOfficeExists(office);
				const after = await rolesIn(admin, office);
				expect(Object.keys(after), "the manager and the platform admin are still in it").toEqual(
					expect.arrayContaining([manager.email, PLATFORM_ADMIN.email]),
				);
			} finally {
				await manager.close();
			}
		} finally {
			for (const invitationId of owners) {
				await admin.cancelInvitation(invitationId);
			}
		}
	});

	test("the platform admin's delete still works: the office is gone", async ({ admin }) => {
		const office = await admin.createOffice("Auth 6 platform admin");
		await admin.expectOfficeExists(office);

		const res = await deleteOffice(admin.api, office.id);

		expect(res.status(), "the platform admin deletes the office").toBe(200);
		await admin.expectOfficeGone(office);
	});
});

/** Each member's kit role in the office, by email, as the platform admin reads the office. */
async function rolesIn(admin: Admin, office: Office): Promise<Record<string, string>> {
	const res = await admin.api.get("/api/auth/organization/get-full-organization", {
		organizationId: office.id,
	});
	expect(res.ok(), "the platform admin reads the office").toBe(true);
	const { members } = (await res.json()) as {
		members: { role: string; user: { email: string } }[];
	};
	return Object.fromEntries(members.map((m) => [m.user.email, m.role]));
}

// scenario: docs/e2e-scenarios.md Auth 7
test.describe("Auth 7 — only a manager replaces the logo", () => {
	test("a member asking for the office's logo upload URL is refused", async () => {
		const agent = await apiAs(AGENT);

		// The agent is a plain member of the walk office (ADR 0010 seed).
		const res = await agent.post("/api/rpc/organizations/createLogoUploadUrl", {
			json: { organizationId: DEMO_OFFICE_ID },
		});
		const body = await res.text();
		await agent.dispose();

		expect(res.status()).toBe(403);
		expect(body).not.toContain("signedUploadUrl");
	});
});
