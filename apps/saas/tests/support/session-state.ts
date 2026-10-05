/** Where each seeded login's minted session lives (written by test-auth.ts, before the specs). */
import fs from "node:fs";
import path from "node:path";

import type { BrowserContext } from "@playwright/test";

import { AGENT, AGENT_2, type Login, MANAGER, PLATFORM_ADMIN } from "./seed";

/** The logins a spec may start signed in as. */
export const SESSION_LOGINS: Login[] = [AGENT, AGENT_2, MANAGER, PLATFORM_ADMIN];

/** The storage state file for `who` (gitignored). */
export function sessionStatePath(who: Login): string {
	return path.resolve(__dirname, "../../playwright/.auth", `${who.email}.json`);
}

/** Signs a browser context in as `who` with their minted session; its pages and API share it. */
export async function signInContext(context: BrowserContext, who: Login) {
	const state = JSON.parse(fs.readFileSync(sessionStatePath(who), "utf8")) as {
		cookies: Parameters<BrowserContext["addCookies"]>[0];
	};
	await context.addCookies(state.cookies);
}
