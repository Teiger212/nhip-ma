import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import type { Admin } from "./fixtures";
import type { Office } from "./offices";
import { NEW_PASSWORD } from "./seed";
import { clientIpHeaders, withOrigin } from "./session";

/** The link the invitation email carries (the unprefixed path; the app adds the locale). */
export function invitationLink(invitationId: string, email: string) {
	return `/signup?invitationId=${invitationId}&email=${encodeURIComponent(email)}`;
}

/** Fills the (invitation) sign-up form and sends it; resolves with the server's answer. */
export async function submitSignUp(page: Page, name: string, password = NEW_PASSWORD) {
	await page.getByTestId("signup-name").fill(name);
	await page.getByTestId("signup-password").fill(password);
	const answered = page.waitForResponse((r) => r.url().includes("/api/auth/sign-up/email"));
	await page.getByTestId("signup-submit").click();
	return answered;
}

/**
 * The invitee opens the email's link and creates their account. With `acceptFails`, the
 * browser's accept request never reaches the server (a dropped connection), which leaves an
 * account with its invitations still pending.
 */
export async function signUpByInvitationLink(
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
	await expect(page.getByTestId("signup-email")).toHaveValue(email);
	const signedUp = await submitSignUp(page, "E2E Invitee");
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
export async function openInboxAsNewAccount(page: Page) {
	await page.goto("/en/inbox");
	await expect(page).toHaveURL(/\/en\/onboarding/);
	await page.getByTestId("onboarding-continue").click();
	// Saving the first-run step and loading the inbox can outlast the default 5 s when many
	// workers share the machine (seen in --repeat-each runs).
	await expect(page).toHaveURL(/\/en\/inbox/, { timeout: 15_000 });
}

/**
 * The inbox works for this account: an office's (empty) thread list, not the refusal an
 * account without an office, or with two, gets (ADR 0010: `no_office`, `ambiguous_office`).
 */
export async function expectInboxLoads(page: Page) {
	await expect(page.getByRole("button", { name: /Your turn/ })).toBeVisible();
	await expect(page.getByTestId("inbox-empty")).toBeVisible();
	await expect(page.getByTestId("inbox-load-error")).toHaveCount(0);
}

/** The kit's roles: an agent is its `member`, a manager its `admin` or `owner` (CONTEXT.md). */
export type KitRole = "member" | "admin" | "owner";

/**
 * A newcomer invited into an office by the platform admin, signed up through the invitation
 * link in a browser context of their own (its own client IP: sign-ups are rate limited). An
 * `owner` invitation is pushed to `ownerInvitations` for the caller to cancel: the fixture's
 * invite knows agents and managers only.
 */
export async function newcomer(
	browser: Browser,
	admin: Admin,
	office: Office,
	tag: string,
	role: KitRole,
	ownerInvitations: string[],
) {
	const email = admin.newEmail(tag);
	let invitationId: string;
	if (role === "owner") {
		// The fixture's invite knows agents and managers only; an owner is set up here.
		const res = await admin.api.post("/api/auth/organization/invite-member", {
			email,
			role,
			organizationId: office.id,
		});
		expect(res.ok(), `the platform admin invites an owner: ${await res.text()}`).toBe(true);
		invitationId = ((await res.json()) as { id: string }).id;
		ownerInvitations.push(invitationId);
	} else {
		invitationId = await admin.invite(email, office.id, role);
	}
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(tag) });
	const page = await context.newPage();
	await signUpByInvitationLink(page, invitationId, email);
	return { email, page, api: withOrigin(page.request), close: () => context.close() };
}
