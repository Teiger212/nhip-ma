import { createECDH, randomBytes } from "node:crypto";

import { testDb, useTestDatabaseForAppClient } from "@inbox/lib/test-store";
import { beforeEach, expect, test, vi } from "vitest";

import { POST } from "./route";

/**
 * `POST /api/alerts/devices` with proof of possession (#135): an endpoint another operator holds
 * moves only with that browser's own keys, else 409, so the browser subscribes afresh. And a
 * sign-in that ended while its device was being registered keeps no device (401). The session
 * gate is stubbed to name the signed-in operator; the rows are real, on the test database.
 */
const gate = vi.hoisted(() => ({ userId: "agent-1", sessionId: "session-1" }));
vi.mock("@inbox/lib/require-session", () => ({
	requireInboxSession: async () => ({
		viewer: { userId: gate.userId, officeId: "office-a", role: "agent" },
		session: { id: gate.sessionId, locale: null, impersonated: false },
	}),
}));

useTestDatabaseForAppClient();

beforeEach(async () => {});

const endpoint = "https://fcm.googleapis.com/fcm/send/e2e-route";

function browserKeys() {
	return {
		p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
		auth: randomBytes(16).toString("base64url"),
	};
}

async function signIn(userId: string, sessionId: string) {
	const now = new Date();
	await testDb.session.deleteMany({ where: { id: sessionId } });
	await testDb.session.create({
		data: {
			id: sessionId,
			userId,
			token: `token-${sessionId}`,
			expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
			createdAt: now,
			updatedAt: now,
		},
	});
	gate.userId = userId;
	gate.sessionId = sessionId;
}

function post(keys: { p256dh: string; auth: string }) {
	return POST(
		new Request("https://nhip.test/api/alerts/devices", {
			method: "POST",
			headers: { "content-type": "application/json", "user-agent": "vitest" },
			body: JSON.stringify({ endpoint, keys }),
		}),
	);
}

test("an endpoint held by another operator is refused with 409 without its keys, and moves with them", async () => {
	const victimsBrowser = browserKeys();
	await signIn("agent-1", "session-victim");
	expect((await post(victimsBrowser)).status).toBe(201);

	await signIn("agent-2", "session-attacker");
	expect((await post(browserKeys())).status).toBe(409);
	expect(await testDb.pushSubscription.findMany({ where: { endpoint } })).toMatchObject([
		{ userId: "agent-1", sessionId: "session-victim" },
	]);

	// The same browser, signed in as agent 2 now (a shared laptop), moves with its own keys.
	expect((await post(victimsBrowser)).status).toBe(201);
	expect(await testDb.pushSubscription.findMany({ where: { endpoint } })).toMatchObject([
		{ userId: "agent-2", sessionId: "session-attacker" },
	]);
});

test("a sign-in that ended before its device was stored keeps no device (401)", async () => {
	await signIn("agent-1", "session-gone");
	await testDb.session.delete({ where: { id: "session-gone" } });

	expect((await post(browserKeys())).status).toBe(401);
	expect(await testDb.pushSubscription.count({ where: { endpoint } })).toBe(0);
});
