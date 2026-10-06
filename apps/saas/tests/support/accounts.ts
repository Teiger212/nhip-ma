/**
 * Makes the account an invitee would make by signing up, with a session to start in (run in the
 * state process, state-process.ts, for `operators.ts`: the Prisma client is ESM, which
 * Playwright's own loader cannot import).
 *
 * Setup only (#186; AGENTS.md, "Test quality"): a spec whose subject is not signing up starts
 * with its operators already signed up. The account is what the invitation sign-up page leaves
 * (Better Auth's own `createUser` and credential `linkAccount`, so its hooks run: the welcome
 * notification), past the first-run step, with no language of its own; the session is one
 * Better Auth's testUtils mints, as for the seeded logins (test-auth.ts). Joining the office
 * stays the server's: the caller accepts the invitation through the API with this session.
 * The welcome notification (and its email, where the env sends mail) is made here, not by the
 * server, as the sign-up's own hook would; no spec reads it from a mailbox.
 */
import { authOptions } from "@repo/auth/auth";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

import { NEW_PASSWORD } from "./seed";

const testAuth = betterAuth({
	...authOptions,
	plugins: [...authOptions.plugins, testUtils()],
});

/** The signed-up account for `email`, password NEW_PASSWORD, and a minted session's cookies. */
export async function signedUp(email: string) {
	const ctx = await testAuth.$context;
	const user = await ctx.internalAdapter.createUser({
		email: email.toLowerCase(),
		name: "E2E Invitee",
		// What the invitation sign-up leaves (invitation-only plugin) and the first-run step sets.
		emailVerified: true,
		onboardingComplete: true,
	});
	await ctx.internalAdapter.linkAccount({
		userId: user.id,
		providerId: "credential",
		accountId: user.id,
		password: await ctx.password.hash(NEW_PASSWORD),
	});
	const domain = new URL(ctx.baseURL).hostname;
	const cookies = await ctx.test.getCookies({ userId: user.id, domain });
	return { userId: user.id, cookies };
}
