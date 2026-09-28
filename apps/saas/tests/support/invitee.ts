import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { NEW_PASSWORD } from "./seed";

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
	await expect(page).toHaveURL(/\/en\/inbox/);
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
