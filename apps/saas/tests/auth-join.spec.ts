import { expect, test } from "./support/fixtures";
import { expectInboxLoads, openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import type { Office } from "./support/offices";
import { acceptInvitation, deleteOffice, officesOf } from "./support/offices";
import { AGENT, WALK_OFFICE_ID } from "./support/seed";
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
});

// scenario: docs/e2e-scenarios.md Auth 7
test.describe("Auth 7 — only a manager replaces the logo", () => {
	test("a member asking for the office's logo upload URL is refused", async () => {
		const agent = await apiAs(AGENT);

		// The agent is a plain member of the walk office (ADR 0010 seed).
		const res = await agent.post("/api/rpc/organizations/createLogoUploadUrl", {
			json: { organizationId: WALK_OFFICE_ID },
		});
		const body = await res.text();
		await agent.dispose();

		expect(res.status()).toBe(403);
		expect(body).not.toContain("signedUploadUrl");
	});
});
