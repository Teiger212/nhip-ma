import { createECDH, randomBytes } from "node:crypto";

import {
	addPushSubscription,
	DEVICES_PER_USER,
	deletePushSubscriptionsForSession,
	type NewPushSubscription,
	pushSubscriptionsForSession,
	pushSubscriptionsForUser,
} from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { settleBackgroundWork } from "../background";
import type { Vapid } from "../config";
import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { account } from "../test-fixtures";
import { testDb, useTestDatabaseForAppClient } from "../test-store";
import { DeviceRegistration, sendTestAlert } from "./devices";
import { webPushTransport } from "./push";

/**
 * Devices (#134; ADR 0019 "How"; spec #84 "Devices"): registering one, an endpoint that changes
 * hands (Q1), the cap per operator (Q2), what signing out and the account's end remove, what
 * the API accepts, and the test alert. Against the test database; web push is stubbed.
 */
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ sendNotification, default: { sendNotification } }));

useTestDatabaseForAppClient();

const MINUTE = 60 * 1000;
const at = new Date("2026-10-05T09:00:00.000Z");

afterEach(async () => {
	// A test alert's push runs in the background; it finishes before the next reset.
	await settleBackgroundWork();
});

beforeEach(async () => {
	sendNotification.mockReset();
	sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
});

const base64url = (bytes: Buffer) => bytes.toString("base64url");

function registration(name: string, overrides: Partial<NewPushSubscription> = {}) {
	return {
		userId: "agent-1",
		sessionId: "session-1",
		endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
		p256dh: base64url(createECDH("prime256v1").generateKeys()),
		auth: base64url(randomBytes(16)),
		userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/129",
		...overrides,
	} satisfies NewPushSubscription;
}

/** The sign-in a registration names, as a real session row: a device needs one (#135). */
async function signedIn(userId: string, sessionId: string) {
	const now = new Date();
	await testDb.session.upsert({
		where: { id: sessionId },
		create: {
			id: sessionId,
			userId,
			token: `token-${sessionId}`,
			expiresAt: new Date(now.getTime() + 60 * MINUTE),
			createdAt: now,
			updatedAt: now,
		},
		update: { userId },
	});
}

/** Register a device from a live sign-in, as the API does. */
async function register(subscription: NewPushSubscription) {
	await signedIn(subscription.userId, subscription.sessionId);
	return addPushSubscription(subscription, testDb);
}

test("registering an endpoint again from another sign-in moves it there, still one device", async () => {
	const phone = registration("phone");
	await register(phone);
	await register({ ...phone, sessionId: "session-2" });

	const rows = await testDb.pushSubscription.findMany({ where: { endpoint: phone.endpoint } });
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ userId: "agent-1", sessionId: "session-2" });
});

test("the same browser registering under another operator moves to them, and the first gets nothing on it (Q1)", async () => {
	// A shared laptop changes hands: the browser posts its one subscription again, same keys.
	const shared = registration("shared-phone", { userId: "agent-1", sessionId: "session-a1" });
	await register(shared);
	const handedOn = { ...shared, userId: "agent-2", sessionId: "session-a2" };

	expect(await register(handedOn)).toBe("added");

	const rows = await testDb.pushSubscription.findMany({ where: { endpoint: shared.endpoint } });
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ userId: "agent-2", sessionId: "session-a2" });
	expect(await pushSubscriptionsForUser("agent-1", testDb)).toEqual([]);
	expect((await pushSubscriptionsForUser("agent-2", testDb)).map((row) => row.endpoint)).toEqual([
		shared.endpoint,
	]);
});

test("another operator posting a held endpoint with other keys is refused, and its holder keeps it (#135)", async () => {
	// Knowing someone's endpoint is not owning their browser: without its keys, nothing moves.
	const victim = registration("victims-phone", { userId: "agent-1", sessionId: "session-v" });
	await register(victim);
	const hijack = { ...registration("victims-phone"), userId: "agent-2", sessionId: "session-h" };

	expect(await register(hijack)).toBe("taken");

	const rows = await testDb.pushSubscription.findMany({ where: { endpoint: victim.endpoint } });
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({
		userId: "agent-1",
		sessionId: "session-v",
		p256dh: victim.p256dh,
		auth: victim.auth,
	});
	expect(await pushSubscriptionsForUser("agent-2", testDb)).toEqual([]);
});

test("a device registered as its sign-in ends does not outlive it (#135)", async () => {
	// The API checked the session, then the operator signed out before the row was written.
	await signedIn("agent-1", "session-ending");
	await testDb.session.delete({ where: { id: "session-ending" } });

	const outcome = await addPushSubscription(
		registration("late", { sessionId: "session-ending" }),
		testDb,
	);

	expect(outcome).toBe("signed_out");
	expect(await testDb.pushSubscription.count({ where: { sessionId: "session-ending" } })).toBe(0);
	expect(await pushSubscriptionsForUser("agent-1", testDb)).toEqual([]);
});

test("two operators registering one endpoint at the same moment leave exactly one device", async () => {
	const endpoint = registration("race").endpoint;
	const outcomes = await Promise.all([
		register({ ...registration("race"), endpoint, userId: "agent-1", sessionId: "session-r1" }),
		register({ ...registration("race"), endpoint, userId: "agent-2", sessionId: "session-r2" }),
	]);
	expect(await testDb.pushSubscription.count({ where: { endpoint } })).toBe(1);
	// Their keys differ, so whoever comes second is refused rather than taking it over.
	expect([...outcomes].sort()).toEqual(["added", "taken"]);
});

test("an operator keeps 10 devices; the eleventh drops the oldest (Q2)", async () => {
	expect(DEVICES_PER_USER).toBe(10);
	for (let i = 0; i < 11; i++) {
		await register(registration(`device-${i}`, { at: new Date(at.getTime() + i * MINUTE) }));
	}
	const kept = (await pushSubscriptionsForUser("agent-1", testDb)).map((row) => row.endpoint);
	expect(kept).toHaveLength(10);
	expect(kept).not.toContain(registration("device-0").endpoint);
	expect(kept).toContain(registration("device-10").endpoint);
});

test("signing out removes that sign-in's devices and no one else's", async () => {
	await register(registration("here-1", { sessionId: "session-out" }));
	await register(registration("here-2", { sessionId: "session-out" }));
	await register(registration("elsewhere", { sessionId: "session-stays" }));
	await register(registration("colleague", { userId: "agent-2", sessionId: "session-colleague" }));

	expect(await deletePushSubscriptionsForSession("session-out", testDb)).toBe(2);

	expect(await pushSubscriptionsForSession("agent-1", "session-out", testDb)).toEqual([]);
	expect((await pushSubscriptionsForUser("agent-1", testDb)).map((row) => row.endpoint)).toEqual([
		registration("elsewhere").endpoint,
	]);
	expect(await pushSubscriptionsForUser("agent-2", testDb)).toHaveLength(1);
});

test("an account that ends takes its devices with it (ADR 0013)", async () => {
	await account("leaving");
	await register(registration("leaving", { userId: "leaving" }));
	await testDb.user.delete({ where: { id: "leaving" } });
	expect(await testDb.pushSubscription.count({ where: { userId: "leaving" } })).toBe(0);
});

test("the API takes a browser's subscription on an allowed push host, and nothing else", () => {
	const body = (
		endpoint: string,
		keys = { p256dh: registration("x").p256dh, auth: registration("x").auth },
	) => ({
		endpoint,
		keys,
	});
	const good = "https://fcm.googleapis.com/fcm/send/e2e-1";
	expect(DeviceRegistration.safeParse(body(good)).success).toBe(true);
	expect(DeviceRegistration.safeParse(body("https://web.push.apple.com/QG-token")).success).toBe(
		true,
	);
	// What is stored (and later posted to) is the endpoint's normal form, the one checked.
	expect(
		DeviceRegistration.parse(body("HTTPS://FCM.googleapis.com./fcm/send/e2e-1")).endpoint,
	).toBe(good);

	for (const refused of [
		body("http://fcm.googleapis.com/fcm/send/e2e-1"),
		body("https://attacker.example/collect"),
		body("https://fcm.googleapis.com.attacker.example/x"),
		// p256dh must be an uncompressed P-256 point (65 bytes), auth 16 bytes, base64url.
		body(good, { p256dh: base64url(randomBytes(33)), auth: registration("x").auth }),
		body(good, { p256dh: registration("x").p256dh, auth: base64url(randomBytes(8)) }),
		body(good, { p256dh: "not base64url!", auth: registration("x").auth }),
		{ endpoint: good },
		null,
	]) {
		expect(DeviceRegistration.safeParse(refused).success, JSON.stringify(refused)).toBe(false);
	}
});

const VAPID: Vapid = {
	publicKey: "BKxP-vitest-only-public-key",
	privateKey: "vitest-only-private-key",
	subject: "mailto:alerts@nhip.local",
};

test("a test alert with no device on this sign-in writes nothing", async () => {
	const store = createInboxStore(testDb);
	await register(registration("other-browser", { sessionId: "session-other" }));
	const runtime = { store, config: mockInboxConfig(), drafts: noDraftAdapter };

	const outcome = await sendTestAlert(runtime, {
		userId: "agent-1",
		officeId: "office-a",
		sessionId: "session-here",
		locale: "en",
	});

	expect(outcome).toBe("no_device");
	expect(await testDb.inboxAlert.count()).toBe(0);
	await store.close();
});

test("a test alert writes one sounding `test` row and pushes to this sign-in's devices only", async () => {
	const store = createInboxStore(testDb);
	const here = registration("this-browser", { sessionId: "session-here" });
	await register(here);
	await register(registration("other-browser", { sessionId: "session-other" }));
	const runtime = { store, config: mockInboxConfig(), drafts: noDraftAdapter };

	const outcome = await sendTestAlert(
		runtime,
		{ userId: "agent-1", officeId: "office-a", sessionId: "session-here", locale: "vi" },
		{ transport: webPushTransport(VAPID) },
	);

	expect(outcome).toBe("sent");
	const rows = await testDb.inboxAlert.findMany();
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({
		userId: "agent-1",
		officeId: "office-a",
		conversationId: null,
		kind: "test",
		sounded: true,
	});
	expect(rows[0].link).toBe(`/vi/inbox?alert=${rows[0].id}`);
	await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
	const [subscription, payload] = sendNotification.mock.calls[0];
	expect(subscription.endpoint).toBe(here.endpoint);
	expect(JSON.parse(payload)).toMatchObject({
		alertId: rows[0].id,
		url: rows[0].link,
		sound: true,
	});
	await store.close();
});
