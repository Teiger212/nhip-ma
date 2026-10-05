import { parse } from "node:url";

import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { Vapid } from "../config";
import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { resetTestInbox, testDb, useTestDatabaseForAppClient } from "../test-store";
import { alertGuestMessage } from "./index";
import { isAllowedPushEndpoint, normalizePushEndpoint, webPushTransport } from "./push";
import type { AlertPayload } from "./transport";

/**
 * The live transport (spec #84 testing seam 4; #134) against the test database, with web push
 * stubbed at its boundary: what it posts and with which options, what a push service's answer
 * does to a device, what reaches the log, and which endpoints it will post to at all.
 */
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ sendNotification, default: { sendNotification } }));

useTestDatabaseForAppClient();

const VAPID: Vapid = {
	publicKey: "BKxP-vitest-only-public-key",
	privateKey: "vitest-only-private-key",
	subject: "mailto:alerts@nhip.local",
};

const PAYLOAD: AlertPayload = {
	alertId: "alert-opaque-1",
	tag: "tag-hmac-of-the-thread",
	title: "Minji is waiting",
	body: "Zalo · Korean",
	url: "/en/inbox?alert=alert-opaque-1",
	sound: true,
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
	await resetTestInbox();
	sendNotification.mockReset();
	sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
	warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

async function device(
	userId: string,
	endpoint: string,
	{ sessionId = `session-${userId}` }: { sessionId?: string } = {},
) {
	return testDb.pushSubscription.create({
		data: {
			userId,
			sessionId,
			endpoint,
			p256dh: `p256dh-of-${endpoint}`,
			auth: `auth-of-${endpoint}`,
			userAgent: "vitest",
		},
	});
}

const byText = (a: string, b: string) => a.localeCompare(b);

const fcm = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

/** A push service's refusal as web-push throws it: the endpoint and its body ride along. */
function refusal(statusCode: number, endpoint: string): Error {
	return Object.assign(new Error(`Received unexpected response code ${endpoint}`), {
		name: "WebPushError",
		statusCode,
		endpoint,
		body: `push service says no to ${endpoint}`,
		headers: {},
	});
}

function postedEndpoints(): string[] {
	return sendNotification.mock.calls.map(([subscription]) => subscription.endpoint).sort(byText);
}

test("each of the operator's devices gets the payload, high urgency, a 1-hour TTL, a 10-second timeout and VAPID, nothing else", async () => {
	const phone = await device("agent-1", fcm("phone"));
	const laptop = await device("agent-1", fcm("laptop"));
	await device("agent-2", fcm("colleague"));

	await webPushTransport(VAPID).send([{ userId: "agent-1", payload: PAYLOAD }]);

	expect(postedEndpoints()).toEqual([phone.endpoint, laptop.endpoint].sort(byText));
	for (const [subscription, body, options] of sendNotification.mock.calls) {
		const own = [phone, laptop].find((row) => row.endpoint === subscription.endpoint)!;
		expect(subscription).toEqual({
			endpoint: own.endpoint,
			keys: { p256dh: own.p256dh, auth: own.auth },
		});
		expect(JSON.parse(body)).toEqual(PAYLOAD);
		expect(options).toEqual({
			urgency: "high",
			TTL: 3600,
			// A push service that hangs cannot stall the background job (#135).
			timeout: 10_000,
			vapidDetails: {
				subject: VAPID.subject,
				publicKey: VAPID.publicKey,
				privateKey: VAPID.privateKey,
			},
		});
	}
	const delivered = await testDb.pushSubscription.findMany({ where: { userId: "agent-1" } });
	expect(delivered.every((row) => row.lastSuccessAt !== null)).toBe(true);
});

test("a 404 or 410 deletes the device; any other refusal keeps it", async () => {
	await device("agent-1", fcm("gone-410"));
	await device("agent-1", fcm("gone-404"));
	await device("agent-1", fcm("busy-503"));
	await device("agent-1", fcm("fine"));
	sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
		if (endpoint.endsWith("410")) throw refusal(410, endpoint);
		if (endpoint.endsWith("404")) throw refusal(404, endpoint);
		if (endpoint.endsWith("503")) throw refusal(503, endpoint);
		return { statusCode: 201, body: "", headers: {} };
	});

	await webPushTransport(VAPID).send([{ userId: "agent-1", payload: PAYLOAD }]);

	expect(sendNotification).toHaveBeenCalledTimes(4);
	const left = await testDb.pushSubscription.findMany({ where: { userId: "agent-1" } });
	expect(left.map((row) => row.endpoint).sort(byText)).toEqual(
		[fcm("busy-503"), fcm("fine")].sort(byText),
	);
});

test("a failed push is logged as its status category, never the endpoint, the user or the alert", async () => {
	const failing = await device("agent-1", fcm("secret-device-token"));
	sendNotification.mockRejectedValue(refusal(503, failing.endpoint));

	await expect(
		webPushTransport(VAPID).send([{ userId: "agent-1", payload: PAYLOAD }]),
	).resolves.toBeUndefined();

	expect(warn).toHaveBeenCalled();
	const logged = JSON.stringify(warn.mock.calls);
	expect(logged).toContain("503");
	for (const secret of [
		failing.endpoint,
		"secret-device-token",
		failing.id,
		"agent-1",
		PAYLOAD.alertId,
		PAYLOAD.tag,
		PAYLOAD.title,
		"push service says no",
	]) {
		expect(logged).not.toContain(secret);
	}
});

test("only push services on the allow-list are posted to, even for a device already stored", async () => {
	await device("agent-1", "https://attacker.example/collect");
	await device("agent-1", "https://fcm.googleapis.com.attacker.example/x");
	const allowed = await device("agent-1", fcm("real"));

	await webPushTransport(VAPID).send([{ userId: "agent-1", payload: PAYLOAD }]);

	expect(postedEndpoints()).toEqual([allowed.endpoint]);
});

test("the allow-list: https on Google's, Apple's, Mozilla's and Microsoft's push hosts", () => {
	for (const endpoint of [
		"https://fcm.googleapis.com/fcm/send/abc:def",
		"https://web.push.apple.com/QGfx-token",
		"https://api.push.apple.com/3/device/x",
		"https://push.apple.com/x",
		"https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
		"https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
		"https://notify.windows.com/x",
		"https://fcm.googleapis.com:443/fcm/send/x",
	]) {
		expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
	}
	for (const endpoint of [
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://fcm.googleapis.com.attacker.example/x",
		"https://evilfcm.googleapis.com/x",
		"https://evilpush.apple.com/x",
		"https://push.apple.com.attacker.example/x",
		"https://push.apple.com.evil.com/x",
		"https://evilnotify.windows.com/x",
		"https://updates.push.services.mozilla.com.attacker.example/x",
		"https://user:pass@fcm.googleapis.com/x",
		"https://fcm.googleapis.com@evil.com/x",
		"https://fcm.googleapis.com:8443/x",
		"https://169.254.169.254/latest/meta-data",
		"https://142.250.0.1/x",
		"https://[::1]/x",
		"https://localhost/x",
		"https://evil.com/fcm.googleapis.com",
		"https://evil.com\\@fcm.googleapis.com/x",
		"not a url",
		"",
	]) {
		expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
	}
});

test("an endpoint is checked and sent in one normal form: case, a trailing dot, %2e, the default port", () => {
	for (const [raw, normal] of [
		["HTTPS://FCM.GoogleAPIs.COM/fcm/send/AbC", "https://fcm.googleapis.com/fcm/send/AbC"],
		["https://fcm.googleapis.com./fcm/send/x", "https://fcm.googleapis.com/fcm/send/x"],
		["https://web.push.apple.com.:443/QG", "https://web.push.apple.com/QG"],
		["https://fcm%2egoogleapis%2ecom/fcm/send/x", "https://fcm.googleapis.com/fcm/send/x"],
	]) {
		expect(normalizePushEndpoint(raw), raw).toBe(normal);
	}
	expect(normalizePushEndpoint("https://evil%2ecom/x")).toBeNull();
	expect(normalizePushEndpoint("https://fcm.googleapis.com../x")).toBeNull();
});

// web-push connects to what Node's legacy `url.parse` reads, not the WHATWG parser's host: a
// host the two read differently must never pass (the review of #134 found these).
test("an endpoint whose host two URL parsers read differently is refused", () => {
	for (const sneaky of [";", "{", "}", "`", '"', "'", "%2e", "|", "^"]) {
		const endpoint = `https://evil.com${sneaky}.push.apple.com/x`;
		expect(normalizePushEndpoint(endpoint), endpoint).toBeNull();
	}
	for (const raw of [
		"https:evil.com.push.apple.com/x",
		"https:/evil.push.apple.com/x",
		"https://fcm.googleapis.com/fcm/send/abc:def",
		"https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
	]) {
		const normal = normalizePushEndpoint(raw);
		expect(normal, raw).not.toBeNull();
		const legacy = parse(normal!);
		expect(legacy.protocol, raw).toBe("https:");
		expect(legacy.hostname, raw).toBe(new URL(normal!).hostname);
		expect(legacy.port, raw).toBeNull();
	}
});

test("a device stored in another form is pushed at its normal form, the one that was checked", async () => {
	await device("agent-1", "https://FCM.googleapis.com./fcm/send/Mixed");

	await webPushTransport(VAPID).send([{ userId: "agent-1", payload: PAYLOAD }]);

	expect(postedEndpoints()).toEqual(["https://fcm.googleapis.com/fcm/send/Mixed"]);
});

test("without VAPID keys the live transport says push is not configured and sends nothing", async () => {
	await device("agent-1", fcm("phone"));

	await webPushTransport(null).send([{ userId: "agent-1", payload: PAYLOAD }]);

	expect(sendNotification).not.toHaveBeenCalled();
	expect(JSON.stringify(warn.mock.calls)).toContain("push not configured");
});

test("pushes go out in parallel, at most 5 at a time, so one slow push service delays no one", async () => {
	for (let i = 0; i < 6; i++) {
		await device("agent-1", fcm(`one-${i}`));
		await device("agent-2", fcm(`two-${i}`));
	}
	let inFlight = 0;
	let most = 0;
	let releaseSlow: () => void = () => {};
	const slow = new Promise<void>((resolve) => {
		releaseSlow = resolve;
	});
	sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
		inFlight++;
		most = Math.max(most, inFlight);
		await (endpoint === fcm("one-0") ? slow : new Promise((resolve) => setTimeout(resolve, 5)));
		inFlight--;
		return { statusCode: 201, body: "", headers: {} };
	});

	const sending = webPushTransport(VAPID).send([
		{ userId: "agent-1", payload: PAYLOAD },
		{ userId: "agent-2", payload: { ...PAYLOAD, alertId: "alert-opaque-2" } },
	]);
	// With one push hanging, every other device, agent 2's included, still gets its push.
	await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(12));
	releaseSlow();
	await sending;

	expect(most).toBe(5);
});

test("a delivery for one sign-in reaches that sign-in's devices only (the test alert)", async () => {
	const here = await device("agent-1", fcm("this-browser"), { sessionId: "session-here" });
	await device("agent-1", fcm("other-browser"), { sessionId: "session-elsewhere" });

	await webPushTransport(VAPID).send([
		{ userId: "agent-1", sessionId: "session-here", payload: PAYLOAD },
	]);

	expect(postedEndpoints()).toEqual([here.endpoint]);
});

test("an operator removed from the office keeps no alerts from it, even with a device left", async () => {
	const store = createInboxStore(testDb);
	await testDb.member.deleteMany({ where: { organizationId: "office-a" } });
	// A manager, whom an Unassigned guest alerts (ADR 0022).
	await testDb.member.create({
		data: {
			id: "m-office-a-agent-1",
			organizationId: "office-a",
			userId: "agent-1",
			role: "admin",
			createdAt: new Date(),
		},
	});
	const stays = await device("agent-1", fcm("stays"));
	await device("agent-2", fcm("left-the-office"));
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId: "removed-operator",
			guestName: "Minji",
			text: "Xin chào",
			vendorMessageId: null,
		},
		"office-a",
	);
	const runtime = { store, config: mockInboxConfig(), drafts: noDraftAdapter };

	await alertGuestMessage(runtime, conversation, { transport: webPushTransport(VAPID) });

	expect(postedEndpoints()).toEqual([stays.endpoint]);
	await store.close();
});
