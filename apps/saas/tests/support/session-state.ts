/** Where each seeded login's minted session lives (written by test-auth.ts, before the specs). */
import fs from "node:fs";
import path from "node:path";

import type { BrowserContext } from "@playwright/test";

import { AGENT, AGENT_2, type Login, MANAGER, PLATFORM_ADMIN } from "./seed";
import { askState } from "./state-client";

type Cookies = Parameters<BrowserContext["addCookies"]>[0];

/** The logins a spec may start signed in as. */
export const SESSION_LOGINS: Login[] = [AGENT, AGENT_2, MANAGER, PLATFORM_ADMIN];

/** The storage state file for `who` (gitignored). */
export function sessionStatePath(who: Login): string {
	return path.resolve(__dirname, "../../playwright/.auth", `${who.email}.json`);
}

/** Signs a browser context in as `who` with their minted session; its pages and API share it. */
export async function signInContext(context: BrowserContext, who: Login) {
	const state = JSON.parse(fs.readFileSync(sessionStatePath(who), "utf8")) as {
		cookies: Cookies;
	};
	await context.addCookies(state.cookies);
}

/**
 * Signs a browser context in as an operator who already has an account, with a new session of
 * its own minted for them (accounts.ts `anotherSession`, #278): the same person in a second
 * browser, sharing nothing with the first. Setup only: signing in is the Auth specs' to prove.
 */
export async function signInAgain(context: BrowserContext, userId: string) {
	await context.addCookies(await askState<Cookies>("session", userId));
}
