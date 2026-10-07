/**
 * Operators who joined an office, made without the sign-up page (#186): only the Auth specs and
 * Team prove signing up through the invitation link (invitee.ts); everywhere else it is setup.
 */
import { expect } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import type { Admin } from "./fixtures";
import type { Api } from "./session";
import { clientIpHeaders, withOrigin } from "./session";
import { askState } from "./state-client";

/** An operator who joined an office, in a browser of their own. */
export type Joined = {
	email: string;
	userId: string;
	/**
	 * A blank tab, signed in: nothing is open until the test opens a page in it (#223), so an
	 * operator the test never looks through costs no page load and no Inbox polling.
	 */
	page: Page;
	api: Api;
	close: () => Promise<void>;
};

type Cookies = Parameters<BrowserContext["addCookies"]>[0];
type Account = { userId: string; cookies: Cookies };

/**
 * The account the invitation sign-up page would make for `email`, and a session for it
 * (accounts.ts, in this worker's state process).
 */
async function signedUpAccount(email: string): Promise<Account> {
	try {
		return await askState<Account>("account", email);
	} catch (error) {
		throw new Error(
			`No account for ${email}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * A new operator of `officeId`, invited by the platform admin, with a blank tab in a browser
 * context of their own (its own client IP): an agent (the kit's `member`) or a manager (the kit's
 * `admin`, CONTEXT.md "Manager"). `tag` marks their email. Their account starts signed up and
 * signed in (setup, accounts.ts); they accept the invitation through the kit's API, so the
 * membership, its role and the session's office are the server's, as after the invitation link.
 * Their password is `NEW_PASSWORD`, for a spec that signs them in elsewhere.
 */
export async function joinOffice(
	admin: Admin,
	browser: Browser,
	officeId: string,
	role: "member" | "admin",
	tag: string,
): Promise<Joined> {
	const email = admin.newEmail(tag);
	const invitationId = await admin.invite(email, officeId, role);
	const account = await signedUpAccount(email);
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(email) });
	try {
		// The minted session, as signInContext gives the seeded logins theirs.
		await context.addCookies(account.cookies);
		const api = withOrigin(context.request);
		const accepted = await api.post("/api/auth/organization/accept-invitation", { invitationId });
		expect(accepted.ok(), `the invitee accepts the invitation: ${await accepted.text()}`).toBe(
			true,
		);
		// Blank: the test opens the Inbox, or any page, when it looks (#223).
		const page = await context.newPage();
		return { email, userId: account.userId, page, api, close: () => context.close() };
	} catch (error) {
		await context.close();
		throw error;
	}
}
