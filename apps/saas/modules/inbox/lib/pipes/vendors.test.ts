import crypto from "node:crypto";

import { expect, test } from "vitest";

import {
	parseWhatsAppWebhook,
	parseZaloWebhook,
	verifyWhatsAppSignature,
	verifyZaloSignature,
} from "./vendors";

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

// The parsers below are the untrusted edge. Meta and Zalo add fields and message types
// without notice, so the contract is: read what you recognise, skip what you do not, and
// never throw. These cases pin that down.

const UNPARSEABLE = [null, undefined, "a string", 42, true, [], {}, { entry: "not-an-array" }];

test("WhatsApp parser reads a well-formed payload", () => {
	const events = parseWhatsAppWebhook({
		object: "whatsapp_business_account",
		entry: [
			{
				id: "wa-entry",
				changes: [
					{
						field: "messages",
						value: {
							metadata: { display_phone_number: "84...", phone_number_id: "pn-1" },
							contacts: [{ wa_id: "16315551181", profile: { name: "Alexei" } }],
							messages: [
								{
									from: "16315551181",
									id: "wamid.1",
									timestamp: "1725600000",
									type: "text",
									text: { body: "Looking to rent in Tay Ho" },
								},
							],
						},
					},
				],
			},
		],
	});
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({
		pipe: "whatsapp",
		source: "guest",
		guestId: "16315551181",
		guestName: "Alexei",
		text: "Looking to rent in Tay Ho",
		vendorMessageId: "wamid.1",
		phoneNumberId: "pn-1",
	});
	// Seconds from Meta, milliseconds in the domain.
	expect(events[0]?.at).toBe(1725600000 * 1000);
});

test("WhatsApp parser reads OA echoes and falls back through to/recipient", () => {
	const events = parseWhatsAppWebhook({
		entry: [
			{
				changes: [
					{
						value: {
							smb_message_echoes: [
								{ to: "16315551181", id: "e1", timestamp: "1725600000", text: { body: "Sent" } },
								{ recipient: "16315551182", text: { body: "Also sent" } },
								{ text: { body: "No addressee" } },
							],
						},
					},
				],
			},
		],
	});
	expect(events.map((event) => event.guestId)).toEqual(["16315551181", "16315551182", "unknown"]);
	expect(events.every((event) => event.source === "oa-echo")).toBe(true);
});

test("WhatsApp parser skips non-text messages without dropping the batch", () => {
	const events = parseWhatsAppWebhook({
		entry: [
			{
				changes: [
					{
						value: {
							messages: [
								{ from: "a", id: "m1", type: "image", image: { id: "img-1" } },
								{ from: "b", id: "m2", type: "sticker", sticker: { id: "st-1" } },
								{ from: "c", id: "m3", type: "text", text: { body: "" } },
								{ from: "d", id: "m4", type: "text", text: { body: "kept" } },
							],
						},
					},
				],
			},
		],
	});
	expect(events).toHaveLength(1);
	expect(events[0]?.guestId).toBe("d");
});

test("WhatsApp parser skips malformed members individually", () => {
	const events = parseWhatsAppWebhook({
		entry: [
			"not an entry",
			{ changes: "not an array" },
			{
				changes: [
					null,
					{ value: "not an object" },
					{
						value: {
							contacts: [{ wa_id: 12345 }, "junk", { wa_id: "d", profile: { name: 99 } }],
							messages: [
								{ from: 12345, text: { body: "numeric sender" } },
								{ from: "b", text: { body: 99 } },
								{ from: "c" },
								{ from: "d", id: "ok", text: { body: "survivor" } },
							],
						},
					},
				],
			},
		],
	});
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({ guestId: "d", text: "survivor", vendorMessageId: "ok" });
	// The contact's malformed profile name degrades to null rather than dropping the message.
	expect(events[0]?.guestName).toBeNull();
});

test("WhatsApp parser tolerates unknown fields and future message types", () => {
	const events = parseWhatsAppWebhook({
		entry: [
			{
				some_future_key: { nested: true },
				changes: [
					{
						field: "messages",
						value: {
							messaging_product: "whatsapp",
							statuses: [{ id: "wamid.1", status: "delivered" }],
							messages: [
								{ from: "a", type: "interactive", interactive: { type: "nfm_reply" } },
								{
									from: "b",
									id: "m2",
									type: "text",
									text: { body: "still read", some_future_field: 1 },
									context: { forwarded: true },
								},
							],
						},
					},
				],
			},
		],
	});
	expect(events).toHaveLength(1);
	expect(events[0]?.text).toBe("still read");
});

test("WhatsApp parser returns [] for an unparseable body and never throws", () => {
	for (const body of UNPARSEABLE) {
		expect(parseWhatsAppWebhook(body)).toEqual([]);
	}
});

test("Zalo parser reads oa_send_text and numeric ids", () => {
	const echo = parseZaloWebhook({
		app_id: "123456",
		event_name: "oa_send_text",
		timestamp: "1725600000000",
		recipient: { id: 98765 },
		message: { text: "Đã gửi", msg_id: "m2" },
	});
	expect(echo).toHaveLength(1);
	expect(echo[0]).toMatchObject({
		pipe: "zalo",
		source: "oa-echo",
		guestId: "98765",
		vendorMessageId: "m2",
	});
	// Zalo already sends milliseconds; the value passes through unscaled.
	expect(echo[0]?.at).toBe(1725600000000);
});

test("Zalo parser ignores unknown events and malformed parties", () => {
	const base = {
		app_id: "123456",
		timestamp: "1725600000000",
		message: { text: "Xin chào", msg_id: "m1" },
	};
	// An event Nhịp does not handle, not an error.
	expect(parseZaloWebhook({ ...base, event_name: "user_seen_message" })).toEqual([]);
	expect(parseZaloWebhook({ ...base, event_name: "user_send_image" })).toEqual([]);
	// user_send_text with no usable sender id.
	expect(parseZaloWebhook({ ...base, event_name: "user_send_text" })).toEqual([]);
	expect(parseZaloWebhook({ ...base, event_name: "user_send_text", sender: { id: null } })).toEqual(
		[],
	);
	expect(parseZaloWebhook({ ...base, event_name: "user_send_text", sender: { id: "" } })).toEqual(
		[],
	);
	expect(parseZaloWebhook({ ...base, event_name: "user_send_text", sender: { id: true } })).toEqual(
		[],
	);
	// A non-text event carries no text to draft from.
	expect(
		parseZaloWebhook({
			...base,
			event_name: "user_send_text",
			sender: { id: "guest-1" },
			message: { attachments: [{ type: "image" }] },
		}),
	).toEqual([]);
});

test("Zalo parser tolerates unknown fields", () => {
	const events = parseZaloWebhook({
		app_id: "123456",
		event_name: "user_send_text",
		timestamp: "1725600000000",
		some_future_key: { nested: true },
		sender: { id: "guest-1", future: 1 },
		message: { text: "Xin chào", msg_id: "m1", attachments: [] },
	});
	expect(events).toHaveLength(1);
	expect(events[0]?.guestId).toBe("guest-1");
});

test("Zalo parser returns [] for an unparseable body and never throws", () => {
	for (const body of UNPARSEABLE) {
		expect(parseZaloWebhook(body)).toEqual([]);
	}
});
