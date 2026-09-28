import { uniqueName } from "./support/data";
import { ADMIN_LIST, expect, test } from "./support/fixtures";
import { submitSignUp } from "./support/invitee";
import { LoginPage } from "./support/login-page";
import { deleteOffice, tryCreateOffice } from "./support/offices";
import { AGENT, NEW_PASSWORD } from "./support/seed";
import { expectCannotSignIn, expectSignedOut, withOrigin } from "./support/session";
import { signInContext } from "./support/session-state";

// Each test has the admin and an agent or attacker, and drives several pages (the admin's lists
// among them); against the dev server under parallel load that outgrows the 30 s default.
test.describe.configure({ timeout: 90_000 });

// scenario: docs/e2e-scenarios.md Auth 2
test.describe("Auth 2 — registering someone else's invited email fails", () => {
	test("an invited email signed up without the invitation link gets no account and no session", async ({
		page,
		admin,
	}) => {
		const invitee = admin.newEmail("invitee");
		await admin.invite(invitee);

		// Without the link there is no sign-up form (public sign-up is closed), so the attacker
		// posts to the sign-up endpoint the form uses, with the invitee's email.
		const attempt = await withOrigin(page.request).post("/api/auth/sign-up/email", {
			email: invitee,
			password: NEW_PASSWORD,
			name: "Not the invitee",
		});
		expect(attempt.ok()).toBe(false);

		await expectSignedOut(page);
		await expectCannotSignIn(page, { email: invitee, password: NEW_PASSWORD });
		await admin.expectNoAccount(invitee);
	});

	test("someone else's invitation link does not register the invited email", async ({
		page,
		admin,
	}) => {
		const invitee = admin.newEmail("invitee");
		const holder = admin.newEmail("holder");
		await admin.invite(invitee);
		const holderInvitation = await admin.invite(holder);

		// The holder's own link, opened in a browser; the form shows the holder's email, locked.
		await page.goto(`/en/signup?invitationId=${holderInvitation}`);
		const email = page.getByTestId("signup-email");
		await expect(email).toHaveValue(holder);

		// A person in the browser unlocks the field and types the invitee's email instead.
		await email.evaluate((input) => input.removeAttribute("readonly"));
		await email.fill(invitee);
		await submitSignUp(page, "Not the invitee");

		await expectSignedOut(page);
		await expectCannotSignIn(page, { email: invitee, password: NEW_PASSWORD });
		await admin.expectNoAccount(invitee);
	});

	test("a cancelled invitation link registers nobody", async ({ page, admin }) => {
		const invitee = admin.newEmail("cancelled");
		const invitation = await admin.invite(invitee);
		await admin.cancelInvitation(invitation);

		// Opened in a browser, the cancelled link offers no sign-up form, only the login page.
		await page.goto(`/en/signup?invitationId=${invitation}`);
		await expect(page).toHaveURL(/\/en\/login/);
		await expect(new LoginPage(page).submit).toBeVisible();
		await expect(page.getByTestId("signup-submit")).toHaveCount(0);

		// Replaying the sign-up the invitation form sends (its invitation id travels in the
		// x-invitation-id header and the callback URL, as seen in the form's own request).
		const attempt = await withOrigin(page.request).post(
			"/api/auth/sign-up/email",
			{
				email: invitee,
				password: NEW_PASSWORD,
				name: "Cancelled invitee",
				callbackURL: `/organization-invitation/${invitation}`,
			},
			{ "x-invitation-id": invitation },
		);
		expect(attempt.ok()).toBe(false);

		await expectSignedOut(page);
		await expectCannotSignIn(page, { email: invitee, password: NEW_PASSWORD });
		await admin.expectNoAccount(invitee);
	});

	// An invitation expires 48 hours after it is sent. Nothing a person can do makes one expire
	// sooner, and specs do not write to the database, so the expired case is not driven here.
	test.fixme("an expired invitation link registers nobody", async () => {});
});

// scenario: docs/e2e-scenarios.md Auth 3
test.describe("Auth 3 — no account without an invitation", () => {
	test("a magic link asked for an email with no account creates nothing", async ({
		page,
		admin,
	}) => {
		const stranger = admin.newEmail("stranger");

		const login = new LoginPage(page);
		await login.goto("en");
		await login.requestMagicLink(stranger);

		await expectSignedOut(page);
		await admin.expectNoAccount(stranger);
	});

	test.skip("Google or GitHub sign-in for an email with no account creates nothing", () => {
		// OAuth providers are not configured locally or in the E2E profile.
	});
});

// scenario: docs/e2e-scenarios.md Auth 4
test.describe("Auth 4 — only the platform admin creates offices", () => {
	test("an agent creating an office is refused; the platform admin succeeds", async ({
		page,
		admin,
	}) => {
		const agentOffice = uniqueName("agent office");

		await signInContext(page.context(), AGENT);
		const agent = withOrigin(page.request);
		const refused = await tryCreateOffice(agent, agentOffice);
		try {
			expect(refused.status()).toBe(403);

			const agentOfficeRow = await admin.searchOffices(agentOffice);
			await expect(admin.page.getByTestId("admin-no-results")).toBeVisible(ADMIN_LIST);
			await expect(agentOfficeRow).toHaveCount(0);

			const created = await admin.createOffice("admin office");
			await expect(await admin.searchOffices(created.name)).toBeVisible(ADMIN_LIST);
		} finally {
			// Should the refusal ever regress, the agent owns the office it made (not the
			// admin): the agent deletes it.
			if (refused.ok()) {
				const { id } = (await refused.json()) as { id: string };
				await deleteOffice(agent, id);
			}
		}
	});
});
