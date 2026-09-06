import crypto from "node:crypto";

import { expect, test } from "vitest";

import { parseZaloWebhook, verifyWhatsAppSignature, verifyZaloSignature } from "./pipes";

const WA_SECRET = "wa-app-secret";
const WA_BODY = JSON.stringify({ entry: [] });
const waSig = (body: string, secret = WA_SECRET) =>
	`sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

test("WhatsApp signature fails closed when the app secret is missing", () => {
	expect(verifyWhatsAppSignature(WA_BODY, waSig(WA_BODY), undefined)).toBe(false);
	expect(verifyWhatsAppSignature(WA_BODY, waSig(WA_BODY), "")).toBe(false);
});

test("WhatsApp signature accepts a valid HMAC and rejects tampering", () => {
	expect(verifyWhatsAppSignature(WA_BODY, waSig(WA_BODY), WA_SECRET)).toBe(true);
	expect(verifyWhatsAppSignature(`${WA_BODY} `, waSig(WA_BODY), WA_SECRET)).toBe(false);
	expect(verifyWhatsAppSignature(WA_BODY, waSig(WA_BODY, "other"), WA_SECRET)).toBe(false);
	expect(verifyWhatsAppSignature(WA_BODY, null, WA_SECRET)).toBe(false);
	expect(verifyWhatsAppSignature(WA_BODY, "sha256=not-hex", WA_SECRET)).toBe(false);
	expect(verifyWhatsAppSignature(WA_BODY, "sha256=abcd", WA_SECRET)).toBe(false);
});

const ZALO_SECRET = "oa-secret-key";
const ZALO_BODY = JSON.stringify({
	app_id: "123456",
	event_name: "user_send_text",
	timestamp: "1725600000000",
	sender: { id: "guest-1" },
	message: { text: "Xin chào", msg_id: "m1" },
});
const zaloSig = (body: string, secret = ZALO_SECRET, appId = "123456", ts = "1725600000000") =>
	`mac=${crypto.createHash("sha256").update(`${appId}${body}${ts}${secret}`).digest("hex")}`;

test("Zalo signature fails closed when the OA secret is missing", () => {
	expect(verifyZaloSignature(ZALO_BODY, zaloSig(ZALO_BODY), undefined)).toBe(false);
	expect(verifyZaloSignature(ZALO_BODY, zaloSig(ZALO_BODY), "")).toBe(false);
});

test("Zalo signature accepts sha256(appId + body + timestamp + secret) and rejects tampering", () => {
	expect(verifyZaloSignature(ZALO_BODY, zaloSig(ZALO_BODY), ZALO_SECRET)).toBe(true);
	// Bare hex without the mac= prefix is also accepted.
	expect(verifyZaloSignature(ZALO_BODY, zaloSig(ZALO_BODY).slice(4), ZALO_SECRET)).toBe(true);
	expect(verifyZaloSignature(ZALO_BODY, zaloSig(ZALO_BODY, "other"), ZALO_SECRET)).toBe(false);
	expect(verifyZaloSignature(ZALO_BODY, null, ZALO_SECRET)).toBe(false);
	expect(verifyZaloSignature("not json", zaloSig("not json"), ZALO_SECRET)).toBe(false);
	const noTimestamp = JSON.stringify({ app_id: "123456", event_name: "user_send_text" });
	expect(verifyZaloSignature(noTimestamp, zaloSig(noTimestamp), ZALO_SECRET)).toBe(false);
});

test("Zalo parser still reads the signed body shape", () => {
	const events = parseZaloWebhook(JSON.parse(ZALO_BODY));
	expect(events).toHaveLength(1);
	expect(events[0]?.guestId).toBe("guest-1");
	expect(events[0]?.vendorMessageId).toBe("m1");
});
