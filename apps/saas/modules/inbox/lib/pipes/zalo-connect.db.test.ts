import { beforeEach, expect, test, vi } from "vitest";

import { mockInboxConfig } from "../config";
import { testInboxStore } from "../test-store";
import type { Store } from "../types";
import { decryptSecret, tokenContext } from "./secrets";
import { completeZaloConnect } from "./zalo-connect";

const KEY = Buffer.alloc(32, 5).toString("base64");
const config = mockInboxConfig({
	zalo: { appId: "app-1", appSecret: "app-secret" },
	pipeSecretsKey: KEY,
});
const attempt = { verifier: "verifier", officeId: "walk-office" };

let store: Store;

/** Zalo: the code becomes tokens for OA `oa-real`, whatever the callback URL says. */
function zaloIssuesTokensFor(oaId: string) {
	return vi.fn(async (url: string | URL) => {
		if (String(url).includes("/access_token")) {
			return Response.json({
				access_token: "access",
				refresh_token: "refresh",
				expires_in: "90000",
			});
		}
		return Response.json({ error: 0, data: { oa_id: oaId, name: "Real OA" } });
	});
}

beforeEach(async () => {
	store = await testInboxStore();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

test("the OA is the one Zalo issued the tokens for; an edited oa_id is refused", async () => {
	vi.stubGlobal("fetch", zaloIssuesTokensFor("oa-real"));
	const outcome = await completeZaloConnect({
		attempt,
		code: "code",
		claimedOaId: "oa-victim",
		config,
		store,
	});
	expect(outcome).toBe("refused");
	expect(await store.officeForPipe("zalo", "oa-victim")).toBeNull();
	expect(await store.officeForPipe("zalo", "oa-real")).toBeNull();
});

test("a connect stores the token's OA for the office, sealed to that OA", async () => {
	vi.stubGlobal("fetch", zaloIssuesTokensFor("oa-real"));
	expect(
		await completeZaloConnect({ attempt, code: "code", claimedOaId: null, config, store }),
	).toBe("connected");
	expect(await store.officeForPipe("zalo", "oa-real")).toBe("walk-office");
	const saved = await store.pipeCredentialState("zalo", "oa-real");
	expect(decryptSecret(saved!.refreshToken, KEY, tokenContext("zalo", "oa-real", "refresh"))).toBe(
		"refresh",
	);
});

test("an OA another office holds is refused as held, and keeps its office", async () => {
	await store.claimPipe({ pipe: "zalo", externalId: "oa-real", officeId: "office-a" });
	vi.stubGlobal("fetch", zaloIssuesTokensFor("oa-real"));
	expect(
		await completeZaloConnect({ attempt, code: "code", claimedOaId: "oa-real", config, store }),
	).toBe("held");
	expect(await store.officeForPipe("zalo", "oa-real")).toBe("office-a");
	expect(await store.pipeCredentialState("zalo", "oa-real")).toBeNull();
});
