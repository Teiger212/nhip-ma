/**
 * Makes the account an invitee would make by signing up, with a session to start in (run through
 * tsx by `operators.ts`, one process per Playwright worker: the Prisma client is ESM, which
 * Playwright's own loader cannot import).
 *
 * Setup only (#186; AGENTS.md, "Test quality"): a spec whose subject is not signing up starts
 * with its operators already signed up. The account is what the invitation sign-up page leaves
 * (Better Auth's own `createUser` and credential `linkAccount`, so its hooks run: the welcome
 * notification), past the first-run step, with no language of its own; the session is one
 * Better Auth's testUtils mints, as for the seeded logins (test-auth.ts). Joining the office
 * stays the server's: the caller accepts the invitation through the API with this session.
 *
 * Reads one JSON request per line on stdin, `{ id, email, name, password }`, and answers each on
 * stdout with a line `@@account {"id", "userId", "cookies"}` or `@@account {"id", "error"}`.
 * Anything else on stdout (a library's notice) is not an answer. Exits when stdin closes.
 */
import readline from "node:readline";

import { authOptions } from "@repo/auth/auth";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

const ANSWER = "@@account ";

type AccountRequest = { id: number; email: string; name: string; password: string };

const testAuth = betterAuth({
	...authOptions,
	plugins: [...authOptions.plugins, testUtils()],
});

async function signedUp({ email, name, password }: AccountRequest) {
	const ctx = await testAuth.$context;
	const user = await ctx.internalAdapter.createUser({
		email: email.toLowerCase(),
		name,
		// What the invitation sign-up leaves (invitation-only plugin) and the first-run step sets.
		emailVerified: true,
		onboardingComplete: true,
	});
	await ctx.internalAdapter.linkAccount({
		userId: user.id,
		providerId: "credential",
		accountId: user.id,
		password: await ctx.password.hash(password),
	});
	const domain = new URL(ctx.baseURL).hostname;
	const cookies = await ctx.test.getCookies({ userId: user.id, domain });
	return { userId: user.id, cookies };
}

function answer(body: Record<string, unknown>) {
	process.stdout.write(`${ANSWER}${JSON.stringify(body)}\n`);
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
	if (!line.trim()) return;
	const request = JSON.parse(line) as AccountRequest;
	signedUp(request).then(
		(account) => answer({ id: request.id, ...account }),
		(error: unknown) =>
			answer({ id: request.id, error: error instanceof Error ? error.message : String(error) }),
	);
});
lines.on("close", () => process.exit(0));
