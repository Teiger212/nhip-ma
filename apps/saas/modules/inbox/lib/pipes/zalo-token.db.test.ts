import { beforeEach, expect, test, vi } from "vitest";

import { mockInboxConfig } from "../config";
import { testInboxStore } from "../test-store";
import type { Store } from "../types";
import { decryptSecret, encryptSecret, tokenContext } from "./secrets";
import { ZaloDisconnectedError, zaloAccessToken } from "./zalo-token";

const KEY = Buffer.alloc(32, 3).toString("base64");
const config = mockInboxConfig({
	sendMode: "live",
	zalo: { appId: "app-1", appSecret: "app-secret" },
	pipeSecretsKey: KEY,
});

let store: Store;

async function connect(expiresInMs: number): Promise<void> {
	await store.claimPipe({ pipe: "zalo", externalId: "oa-1", officeId: "walk-office" });
	await store.savePipeCredential("zalo", "oa-1", {
		accessToken: encryptSecret("access-old", KEY, tokenContext("zalo", "oa-1", "access")),
		refreshToken: encryptSecret("refresh-old", KEY, tokenContext("zalo", "oa-1", "refresh")),
		accessTokenExpiresAt: new Date(Date.now() + expiresInMs),
	});
}

/** Zalo's token endpoint: a fresh pair per call, after a pause so calls can overlap. */
function zaloIssuesTokens() {
	let issued = 0;
	return vi.fn(async (_url: unknown, init?: RequestInit) => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		issued += 1;
		const body = new URLSearchParams(init?.body as string);
		expect(body.get("refresh_token")).toBe("refresh-old");
		return Response.json({
			access_token: `access-${issued}`,
			refresh_token: `refresh-${issued}`,
			expires_in: "90000",
		});
	});
}

beforeEach(async () => {
	store = await testInboxStore();
});

test("a token far from expiry is used as is, with no refresh", async () => {
	await connect(60 * 60 * 1000);
	const fetchSpy = vi.fn();
	vi.stubGlobal("fetch", fetchSpy);
	expect(await zaloAccessToken({ store, config, oaId: "oa-1" })).toBe("access-old");
	expect(fetchSpy).not.toHaveBeenCalled();
});

test("two sends racing an expired token refresh exactly once and both get the new token", async () => {
	await connect(-1000);
	const fetchSpy = zaloIssuesTokens();
	vi.stubGlobal("fetch", fetchSpy);
	const tokens = await Promise.all([
		zaloAccessToken({ store, config, oaId: "oa-1" }),
		zaloAccessToken({ store, config, oaId: "oa-1" }),
	]);
	// The single-use refresh token was spent once; the second send read the saved pair.
	expect(fetchSpy).toHaveBeenCalledTimes(1);
	expect(tokens).toEqual(["access-1", "access-1"]);
	const saved = await store.pipeCredentialState("zalo", "oa-1");
	expect(decryptSecret(saved!.refreshToken, KEY, tokenContext("zalo", "oa-1", "refresh"))).toBe(
		"refresh-1",
	);
	expect(saved!.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000);
});

test("a refused refresh keeps the old tokens, records the disconnect once, and says so", async () => {
	await connect(-1000);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: -14014, message: "invalid refresh token" })),
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
	const first = await zaloAccessToken({ store, config, oaId: "oa-1" }).catch((err: unknown) => err);
	expect(first).toBeInstanceOf(ZaloDisconnectedError);
	expect(first).toMatchObject({
		newly: true,
		reason: expect.stringMatching(/invalid refresh token/),
	});
	// Operators are not told the OA id or Zalo's words.
	expect((first as Error).message).not.toMatch(/oa-1|14014/);
	const saved = await store.pipeCredentialState("zalo", "oa-1");
	expect(decryptSecret(saved!.refreshToken, KEY, tokenContext("zalo", "oa-1", "refresh"))).toBe(
		"refresh-old",
	);
	expect(saved!.disconnectedAt).not.toBeNull();
	// The next send is refused without calling Zalo, and does not alert again.
	const fetchSpy = vi.fn();
	vi.stubGlobal("fetch", fetchSpy);
	const second = await zaloAccessToken({ store, config, oaId: "oa-1" }).catch(
		(err: unknown) => err,
	);
	expect(second).toMatchObject({ newly: false });
	expect(fetchSpy).not.toHaveBeenCalled();
});

test("a Zalo outage is a plain send failure: nothing is disconnected and the tokens stay", async () => {
	await connect(-1000);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })),
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
	const err = await zaloAccessToken({ store, config, oaId: "oa-1" }).catch((e: unknown) => e);
	expect(err).not.toBeInstanceOf(ZaloDisconnectedError);
	expect((err as { kind?: string }).kind).toBe("config");
	const saved = await store.pipeCredentialState("zalo", "oa-1");
	expect(saved!.disconnectedAt).toBeNull();
	expect(decryptSecret(saved!.refreshToken, KEY, tokenContext("zalo", "oa-1", "refresh"))).toBe(
		"refresh-old",
	);
});

test("tokens sealed for another OA do not open here: the OA is disconnected, not misused", async () => {
	await store.claimPipe({ pipe: "zalo", externalId: "oa-1", officeId: "walk-office" });
	await store.savePipeCredential("zalo", "oa-1", {
		accessToken: encryptSecret("access-other", KEY, tokenContext("zalo", "oa-2", "access")),
		refreshToken: encryptSecret("refresh-other", KEY, tokenContext("zalo", "oa-2", "refresh")),
		accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
	await expect(zaloAccessToken({ store, config, oaId: "oa-1" })).rejects.toMatchObject({
		reason: "stored tokens unreadable",
		newly: true,
	});
});
