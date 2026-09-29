import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { mockInboxConfig } from "../config";
import { testInboxStore } from "../test-store";
import type { Store } from "../types";
import { decryptSecret, encryptSecret } from "./secrets";
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
		accessToken: encryptSecret("access-old", KEY),
		refreshToken: encryptSecret("refresh-old", KEY),
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

afterEach(() => {
	vi.unstubAllGlobals();
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
	expect(decryptSecret(saved!.refreshToken, KEY)).toBe("refresh-1");
	expect(saved!.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000);
});

test("a refused refresh writes nothing and reports the OA disconnected", async () => {
	await connect(-1000);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: -14014, message: "invalid refresh token" })),
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
	await expect(zaloAccessToken({ store, config, oaId: "oa-1" })).rejects.toBeInstanceOf(
		ZaloDisconnectedError,
	);
	const saved = await store.pipeCredentialState("zalo", "oa-1");
	expect(decryptSecret(saved!.refreshToken, KEY)).toBe("refresh-old");
	expect(saved!.disconnectedAt).toBeNull();
});

test("a disconnected OA is refused without calling Zalo", async () => {
	await connect(-1000);
	await store.markPipeDisconnected("zalo", "oa-1", "invalid refresh token");
	const fetchSpy = vi.fn();
	vi.stubGlobal("fetch", fetchSpy);
	await expect(zaloAccessToken({ store, config, oaId: "oa-1" })).rejects.toThrow(
		/invalid refresh token/,
	);
	expect(fetchSpy).not.toHaveBeenCalled();
});
