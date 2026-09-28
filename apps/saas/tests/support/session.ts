import { expect, request, test } from "@playwright/test";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";

import { LoginPage } from "./login-page";
import type { Login } from "./seed";

/** The app's origin, from the running project's baseURL. */
export function appOrigin(): string {
	return new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin;
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

/** Signs a request context in through the auth API (setup, not the scenario under test). */
export async function signInApi(api: Api, who: Login) {
	const res = await api.post("/api/auth/sign-in/email", who);
	expect(res.ok(), `sign in as ${who.email}`).toBe(true);
}

/** A bare API client of its own: anonymous, or signed in as `who`. Dispose it when done. */
export async function apiAs(who?: Login): Promise<Api & { dispose: () => Promise<void> }> {
	const context = await request.newContext({ baseURL: appOrigin() });
	const api = withOrigin(context);
	if (who) {
		await signInApi(api, who);
	}
	return { ...api, dispose: () => context.dispose() };
}

/** Signs in through the login page, as a person would, and waits until the app lets them in. */
export async function signIn(page: Page, who: Login) {
	const login = new LoginPage(page);
	await login.goto("en");
	await login.signIn(who.email, who.password);
	await expectSignedIn(page);
}

/** Signed in: the login page lets go (the first visit to the app compiles slowly in dev). */
export async function expectSignedIn(page: Page) {
	await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
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
