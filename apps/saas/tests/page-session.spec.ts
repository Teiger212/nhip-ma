import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { request } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import { homeCopy } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import { LoginPage } from "./support/login-page";
import { joinOffice } from "./support/operators";
import { AGENT, officeUrl } from "./support/seed";
import { appOrigin, clientIpHeaders, withOrigin } from "./support/session";
import { sessionStatePath, signInContext } from "./support/session-state";

const HOME = homeCopy("en");

/** Where a signed-out caller must end up: the locale's login page. */
const LOGIN = "/en/login";

/**
 * A request the app's client router made to move to Home: its full URL (with its `_rsc`) and the
 * headers that make it a React Server Components navigation (`RSC`, `Next-Router-State-Tree`,
 * `Next-Url`: every `Next-*` header it sent), captured, never built.
 */
type Navigation = { url: string; headers: Record<string, string> };

/** What the server answered a replayed navigation. */
type Answer = { status: number; location: string | undefined; body: string };

/** A prefetch is the router reading ahead, not a person moving: it is never replayed. */
function isPrefetch(headers: Record<string, string>): boolean {
	return Object.keys(headers).some((name) => name.toLowerCase().includes("prefetch"));
}

/**
 * The seeded agent, signed in, on the Inbox, moves to Home the way a person does: by clicking
 * Home in the nav. Every navigation request the client router made for Home is returned, with
 * only its `RSC` and `Next-*` headers (the rest are the browser's, not the router's).
 */
async function captureMoveToHome(context: BrowserContext): Promise<Navigation[]> {
	await signInContext(context, AGENT);
	const page = await context.newPage();
	const moves: Navigation[] = [];
	page.on("request", (req) => {
		const headers = req.headers();
		if (headers.rsc !== "1" || isPrefetch(headers) || new URL(req.url()).pathname !== "/en/home") {
			return;
		}
		const router = Object.fromEntries(
			Object.entries(headers).filter(([name]) => name === "rsc" || name.startsWith("next-")),
		);
		moves.push({ url: req.url(), headers: router });
	});
	await page.goto("/en/inbox");
	await page.getByRole("link", { name: "Home", exact: true }).click();
	await expect(page).toHaveURL(/\/en\/home$/);
	await expect(
		page.getByText(HOME.subtitle, { exact: true }),
		"the agent is on Home",
	).toBeVisible();
	expect(
		moves.length,
		"moving to Home made a navigation request, not only prefetches",
	).toBeGreaterThan(0);
	return moves;
}

/**
 * `movesToHome`: the agent's move to Home, captured once per worker (#278), in a browser context
 * of its own, and only by a worker whose tests replay it. What is captured is the build's URL and
 * router headers, not the session: every replay carries only its own cookie.
 */
const test = base.extend<object, { movesToHome: Navigation[] }>({
	movesToHome: [
		async ({ browser }, use, workerInfo) => {
			// No test is running at worker scope, so the project's own address and a client IP of
			// the worker's own (Better Auth's per-IP rate limit), not the per-test ones.
			const { baseURL, ignoreHTTPSErrors } = workerInfo.project.use;
			const n = workerInfo.workerIndex;
			const context = await browser.newContext({
				baseURL,
				ignoreHTTPSErrors,
				extraHTTPHeaders: { "x-forwarded-for": `10.253.${(n >> 8) & 255}.${n & 255}` },
			});
			let moves: Navigation[];
			try {
				moves = await captureMoveToHome(context);
			} finally {
				await context.close();
			}
			await use(moves);
		},
		{ scope: "worker" },
	],
});

/**
 * Replays a captured navigation from a request context of its own, which holds no cookie: the
 * same URL and router headers, plus `cookie` when one is given. Redirects are not followed, so
 * the answer is the server's own.
 */
async function replay(move: Navigation, cookie?: string): Promise<Answer> {
	const api = await request.newContext({
		baseURL: appOrigin(),
		ignoreHTTPSErrors: true,
		extraHTTPHeaders: clientIpHeaders("replay"),
	});
	try {
		const res = await api.get(move.url, {
			headers: { ...move.headers, ...(cookie ? { cookie } : {}) },
			maxRedirects: 0,
		});
		return { status: res.status(), location: res.headers().location, body: await res.text() };
	} finally {
		await api.dispose();
	}
}

/**
 * Where the answer sends the caller, as a path: an HTTP redirect's `Location`, or the redirect
 * instruction Next puts in an RSC answer (`NEXT_REDIRECT;replace;<url>;307;`, as the office's own
 * address `/en/<office slug>` answers a signed-in agent's move). Anything else says what it was instead.
 */
function sentTo(answer: Answer): string {
	if (answer.status >= 300 && answer.status < 400) {
		return answer.location
			? new URL(answer.location, appOrigin()).pathname
			: `a ${answer.status} with no Location`;
	}
	const instruction = /"digest":"NEXT_REDIRECT;[a-z]+;([^;"]+);\d+;/.exec(answer.body);
	if (answer.status === 200 && instruction) {
		return new URL(instruction[1], appOrigin()).pathname;
	}
	return `nowhere: answered ${answer.status} with no redirect`;
}

/** Which of Home's own words are in the answer. */
function homeShown(body: string): string[] {
	return HOME.markers.filter(
		(marker) => body.includes(marker) || body.includes(JSON.stringify(marker).slice(1, -1)),
	);
}

/** Each navigation, replayed with `cookie` (or none), is sent to login with none of Home. */
async function expectSentToLogin(moves: Navigation[], cookie: string | undefined, who: string) {
	const answers = [];
	for (const move of moves) {
		const answer = await replay(move, cookie);
		answers.push({
			request: move.url,
			sentTo: sentTo(answer),
			homeShown: homeShown(answer.body),
		});
	}
	// Soft: a test with two kinds of cookie reports both.
	expect
		.soft(answers, `${who}: every replayed move to Home is sent to login, with none of Home`)
		.toEqual(moves.map((move) => ({ request: move.url, sentTo: LOGIN, homeShown: [] })));
}

/** Each navigation, replayed with `cookie`, renders Home: its header and its funnel. */
async function expectHomeRendered(moves: Navigation[], cookie: string, who: string) {
	for (const move of moves) {
		const answer = await replay(move, cookie);
		const instruction = /NEXT_REDIRECT;[^"]*/.exec(answer.body)?.[0];
		expect(
			{ status: answer.status, redirect: instruction, home: homeShown(answer.body) },
			`${who}: the replayed move to Home (${move.url}) renders Home`,
		).toEqual({
			status: 200,
			redirect: undefined,
			home: expect.arrayContaining([HOME.subtitle, HOME.funnel.title, HOME.funnel.leadsIn]),
		});
	}
}

/** The name of the session cookie, as the seeded agent's signed-in browser holds it. */
function sessionCookieName(): string {
	const state = JSON.parse(fs.readFileSync(sessionStatePath(AGENT), "utf8")) as {
		cookies: { name: string; value: string }[];
	};
	const session = state.cookies.find((c) => c.name.includes("session_token"));
	expect(session, "the signed-in agent's browser holds a session cookie").toBeDefined();
	return session!.name;
}

/** The seeded agent's own session cookie, as a `cookie` header. */
function agentCookie(): string {
	const state = JSON.parse(fs.readFileSync(sessionStatePath(AGENT), "utf8")) as {
		cookies: { name: string; value: string }[];
	};
	const name = sessionCookieName();
	const { value } = state.cookies.find((c) => c.name === name)!;
	return `${name}=${value}`;
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Auth 8
test.describe("Auth 8 — a signed-in page shows nothing to someone signed out, however it is asked for", () => {
	test("signed out, a browser opening Home ends on the login page, with nothing of Home shown", async ({
		page,
	}) => {
		// Every answer the browser gets for Home's own address, on the way to wherever it ends. Today
		// it is a bare redirect, with no body to read; should Home ever answer with a page that then
		// sends the browser on, that page must carry nothing of Home either.
		const answers: Promise<string>[] = [];
		page.on("response", (res) => {
			if (new URL(res.url()).pathname === "/en/home") {
				answers.push(res.text().catch(() => ""));
			}
		});

		await page.goto("/en/home");
		await expect(page).toHaveURL(/\/en\/login(\?|$)/);
		await expect(new LoginPage(page).email, "the login page is shown").toBeVisible();

		for (const marker of HOME.markers) {
			await expect(page.getByText(marker), `the login page shows no "${marker}"`).toHaveCount(0);
		}
		await expect(page.getByRole("list", { name: HOME.funnel.title })).toHaveCount(0);
		const bodies = await Promise.all(answers);
		expect(bodies.flatMap(homeShown), "no answer for Home carried any of it").toEqual([]);
	});

	test("the app's own move to Home, replayed with no session cookie, is sent to login with none of Home", async ({
		movesToHome: moves,
	}) => {
		await expectSentToLogin(moves, undefined, "no session cookie");
	});

	test("the app's own move to Home, replayed with a session cookie that no longer opens a session (made up, or signed out), is sent to login with none of Home", async ({
		admin,
		browser,
		movesToHome: moves,
	}) => {
		test.setTimeout(120_000);
		const name = sessionCookieName();

		// Made up: the session cookie's name, a value no session ever had.
		await expectSentToLogin(moves, `${name}=made-up-${randomUUID()}`, "a made-up session cookie");

		// Signed out: an agent of an office of the test's own, whose real session opens Home, then
		// signs out; the cookie they held no longer opens a session.
		const office = await admin.createOffice("Page session");
		const agent = await joinOffice(admin, browser, office.id, "member", "page-session");
		try {
			const held = (await agent.page.context().cookies()).find((c) => c.name === name);
			expect(held, "the joined agent's browser holds the session cookie").toBeDefined();
			const cookie = `${name}=${held!.value}`;
			await expectHomeRendered(moves, cookie, "the joined agent, still signed in");

			const signedOut = await agent.api.post("/api/auth/sign-out", {});
			expect(
				signedOut.ok(),
				`the agent signs out: ${signedOut.status()} ${await signedOut.text()}`,
			).toBe(true);
			const anon = await request.newContext({
				baseURL: appOrigin(),
				ignoreHTTPSErrors: true,
				extraHTTPHeaders: { ...clientIpHeaders("signed-out"), cookie },
			});
			try {
				const session = await withOrigin(anon).get("/api/auth/get-session");
				expect(await session.json(), "the cookie they held opens no session any more").toBeNull();
			} finally {
				await anon.dispose();
			}

			await expectSentToLogin(moves, cookie, "a signed-out session cookie");
		} finally {
			await agent.close();
		}
	});

	test("signed in, the same replayed move to Home does render Home: its header and its funnel", async ({
		movesToHome: moves,
	}) => {
		await expectHomeRendered(moves, agentCookie(), "the signed-in agent");

		// The same move aimed at an address that sends a signed-in agent on, the office's own
		// (/en/<office slug>) and the locale root (/en), both to the Inbox: the redirect is read where it is,
		// so a refusal above is judged by where it sends, not merely that it redirects.
		for (const address of [officeUrl(""), "/en"]) {
			const url = new URL(moves[0].url);
			url.pathname = address;
			const answer = await replay({ ...moves[0], url: url.toString() }, agentCookie());
			expect(sentTo(answer), `the signed-in agent's move to ${address} is sent to the Inbox`).toBe(
				"/en/inbox",
			);
		}
	});
});
