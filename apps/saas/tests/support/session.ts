import { createHash } from "node:crypto";

import { expect, request, test } from "@playwright/test";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";

import { LoginPage } from "./login-page";
import type { Login } from "./seed";
import { sessionStatePath } from "./session-state";

/** The app's origin, from the running project's baseURL. */
export function appOrigin(): string {
	return new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin;
}

/**
 * The client address this test's requests come from. Better Auth rate-limits per client IP
 * (read from x-forwarded-for), so each test, and each person in it, is its own client
 * rather than every test sharing one address and tripping the limit.
 */
export function clientIpHeaders(person = "guest"): Record<string, string> {
	const info = test.info();
	const [a, b, c] = createHash("sha256")
		.update(`${info.testId}:${info.repeatEachIndex}:${info.retry}:${person}`)
		.digest();
	return { "x-forwarded-for": `10.${a}.${b}.${c}` };
}

/** Requests as the app's own calls send them: Better Auth refuses cookie-bearing writes without an Origin. */
export type Api = {
	get: (url: string, params?: Record<string, string>) => Promise<APIResponse>;
	post: (url: string, data?: unknown, headers?: Record<string, string>) => Promise<APIResponse>;
};

/** Wraps a request context (a page's, a browser context's) so every write carries the Origin. */
export function withOrigin(api: APIRequestContext): Api {
	const origin = appOrigin();
	return {
		get: (url, params) => api.get(url, { params }),
		post: (url, data, headers) => api.post(url, { data, headers: { origin, ...headers } }),
	};
}

/** A bare API client of its own: anonymous, or signed in as `who` (their minted session). Dispose it when done. */
export async function apiAs(who?: Login): Promise<Api & { dispose: () => Promise<void> }> {
	const context = await request.newContext({
		baseURL: appOrigin(),
		extraHTTPHeaders: clientIpHeaders(who?.email),
		storageState: who ? sessionStatePath(who) : undefined,
	});
	return { ...withOrigin(context), dispose: () => context.dispose() };
}

/** Nobody is signed in on this page: the inbox asks for a login (AGENTS.md: no bypass route). */
export async function expectSignedOut(page: Page) {
	await page.goto("/en/inbox");
	await expect(page).toHaveURL(/\/en\/login/);
}

/** Signing in with these credentials is refused: the form says so and nobody is signed in. */
export async function expectCannotSignIn(page: Page, who: Login) {
	const login = new LoginPage(page);
	await login.goto("en");
	await login.signIn(who.email, who.password);
	await login.expectRefused();
	await expectSignedOut(page);
}
