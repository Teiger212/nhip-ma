/**
 * Mints the E2E sessions (run by tests/sessions.setup.ts through tsx: the Prisma client is
 * ESM, which Playwright's own loader cannot import).
 *
 * A test-only Better Auth instance: the app's own options (packages/auth/auth.ts) plus
 * Better Auth's testUtils, which never ship in the app. It shares the server's database,
 * secret and URL (playwright.config.ts loads them), so the sessions it mints are sessions the
 * app accepts. Each seeded login gets a fresh session, written as a Playwright storage state.
 *
 * Setup only (AGENTS.md, "Test quality"): a known person starts signed in without the
 * rate-limited sign-in endpoint. Flows under test still go through the app.
 */
import fs from "node:fs";
import path from "node:path";

import { authOptions } from "@repo/auth/auth";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

import { SESSION_LOGINS, sessionStatePath } from "./session-state";

const testAuth = betterAuth({
	...authOptions,
	plugins: [...authOptions.plugins, testUtils()],
});

async function main(): Promise<void> {
	const ctx = await testAuth.$context;
	const domain = new URL(ctx.baseURL).hostname;
	for (const who of SESSION_LOGINS) {
		const found = await ctx.internalAdapter.findUserByEmail(who.email);
		if (!found) {
			throw new Error(`No account for ${who.email}; is the E2E database seeded?`);
		}
		const cookies = await ctx.test.getCookies({ userId: found.user.id, domain });
		const file = sessionStatePath(who);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify({ cookies, origins: [] }, null, 2));
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
