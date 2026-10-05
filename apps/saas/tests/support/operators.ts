/**
 * Operators who joined an office, made without the sign-up page (#186): only the Auth specs and
 * Team prove signing up through the invitation link (invitee.ts); everywhere else it is setup.
 */
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import { expect } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import type { Admin } from "./fixtures";
import { NEW_PASSWORD } from "./seed";
import type { Api } from "./session";
import { clientIpHeaders, withOrigin } from "./session";

/** An operator who joined an office, in a browser of their own, on their Inbox. */
export type Joined = {
	email: string;
	userId: string;
	page: Page;
	api: Api;
	close: () => Promise<void>;
};

type Cookies = Parameters<BrowserContext["addCookies"]>[0];
type Account = { userId: string; cookies: Cookies };
type Answer = { id: number; error?: string } & Partial<Account>;

const ANSWER = "@@account ";

/** This worker's account maker (accounts.ts), started on first use; it ends with the worker. */
let accounts:
	| {
			child: ChildProcessWithoutNullStreams;
			waiting: Map<number, (answer: Answer) => void>;
			next: number;
	  }
	| undefined;

function accountMaker() {
	if (accounts && accounts.child.exitCode === null) return accounts;
	const saas = path.resolve(__dirname, "../..");
	const child = spawn(
		path.join(saas, "node_modules/.bin/tsx"),
		["--tsconfig", "tsconfig.json", "tests/support/accounts.ts"],
		{ cwd: saas, stdio: ["pipe", "pipe", "inherit"] as never },
	) as ChildProcessWithoutNullStreams;
	const waiting = new Map<number, (answer: Answer) => void>();
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		if (!line.startsWith(ANSWER)) return;
		const answer = JSON.parse(line.slice(ANSWER.length)) as Answer;
		waiting.get(answer.id)?.(answer);
		waiting.delete(answer.id);
	});
	child.on("exit", (code) => {
		for (const [id, settle] of waiting) {
			settle({ id, error: `the account maker exited (${code})` });
		}
		waiting.clear();
	});
	// The worker never waits on it to exit: it ends when the worker's end closes its stdin.
	child.unref();
	accounts = { child, waiting, next: 1 };
	return accounts;
}

/** The account the invitation sign-up page would make for `email`, and a session for it. */
async function signedUpAccount(email: string): Promise<Account> {
	const maker = accountMaker();
	const id = maker.next++;
	const answer = await new Promise<Answer>((resolve) => {
		maker.waiting.set(id, resolve);
		maker.child.stdin.write(
			`${JSON.stringify({ id, email, name: "E2E Invitee", password: NEW_PASSWORD })}\n`,
		);
	});
	if (answer.error || !answer.userId || !answer.cookies) {
		throw new Error(`No account for ${email}: ${answer.error ?? "no answer"}`);
	}
	return { userId: answer.userId, cookies: answer.cookies };
}

/**
 * A new operator of `officeId`, invited by the platform admin, on their Inbox in a browser
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
		const page = await context.newPage();
		await page.goto("/en/inbox");
		await expect(page).toHaveURL(/\/en\/inbox/, { timeout: 15_000 });
		return { email, userId: account.userId, page, api, close: () => context.close() };
	} catch (error) {
		await context.close();
		throw error;
	}
}
