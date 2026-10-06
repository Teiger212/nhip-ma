/**
 * Operators who joined an office, made without the sign-up page (#186): only the Auth specs and
 * Team prove signing up through the invitation link (invitee.ts); everywhere else it is setup.
 */
import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import type { Readable, Writable } from "node:stream";

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

/** How long one account may take before the test fails naming the account maker. */
const ANSWER_TIMEOUT_MS = 30_000;

type AccountMaker = {
	child: ChildProcessByStdio<Writable, Readable, null>;
	waiting: Map<number, (answer: Answer) => void>;
	next: number;
	/** Why it can no longer answer, once it can't. */
	dead?: string;
};

/** This worker's account maker (accounts.ts), started on first use, and again if it died. */
let accounts: AccountMaker | undefined;

function accountMaker(): AccountMaker {
	if (accounts && !accounts.dead) return accounts;
	const saas = path.resolve(__dirname, "../..");
	const child = spawn(
		path.join(saas, "node_modules/.bin/tsx"),
		["--tsconfig", "tsconfig.json", "tests/support/accounts.ts"],
		{ cwd: saas, stdio: ["pipe", "pipe", "inherit"] },
	);
	const maker: AccountMaker = { child, waiting: new Map(), next: 1 };
	// Every waiter fails with the reason, rather than the test timing out with nothing to go on.
	const die = (reason: string) => {
		maker.dead ??= reason;
		for (const [id, settle] of maker.waiting) {
			settle({ id, error: `the account maker ${maker.dead}` });
		}
		maker.waiting.clear();
	};
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		if (!line.startsWith(ANSWER)) return;
		let answer: Answer;
		try {
			answer = JSON.parse(line.slice(ANSWER.length)) as Answer;
		} catch {
			die(`answered something unreadable: ${line.slice(0, 200)}`);
			return;
		}
		maker.waiting.get(answer.id)?.(answer);
		maker.waiting.delete(answer.id);
	});
	child.on("exit", (code, signal) => die(`exited (${signal ?? code})`));
	child.on("error", (error) => die(`could not run: ${error.message}`));
	child.stdin.on("error", (error) => die(`stopped reading: ${error.message}`));
	// Nothing here keeps the worker alive or outlives it: Playwright ends the worker with
	// process.exit, which closes the child's stdin, and accounts.ts exits when stdin closes.
	child.unref();
	accounts = maker;
	return maker;
}

/** The account the invitation sign-up page would make for `email`, and a session for it. */
async function signedUpAccount(email: string): Promise<Account> {
	const maker = accountMaker();
	const id = maker.next++;
	const answer = await new Promise<Answer>((resolve) => {
		const timer = setTimeout(() => {
			maker.waiting.delete(id);
			resolve({ id, error: `the account maker did not answer in ${ANSWER_TIMEOUT_MS / 1000} s` });
		}, ANSWER_TIMEOUT_MS);
		maker.waiting.set(id, (settled) => {
			clearTimeout(timer);
			resolve(settled);
		});
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
