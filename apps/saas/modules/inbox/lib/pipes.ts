import crypto from "crypto";

import { z } from "zod";

import type { InboxConfig } from "./config";
import type { Conversation, InboundEvent, Pipe, SendResult } from "./types";

export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WindowState =
	| { open: true; reason: null; message?: undefined }
	| { open: false; reason: "no_inbound" | "outside_24h_window"; message: string };

export function whatsappWindowState(
	conversation: Pick<Conversation, "pipe" | "lastGuestInboundAt"> | null,
	now = Date.now(),
): WindowState {
	if (!conversation || conversation.pipe !== "whatsapp") {
		return { open: true, reason: null };
	}
	if (!conversation.lastGuestInboundAt) {
		return {
			open: false,
			reason: "no_inbound",
			message: "No guest inbound on this WhatsApp thread. Free-form send is refused.",
		};
	}
	const last = new Date(conversation.lastGuestInboundAt).getTime();
	if (Number.isNaN(last) || now - last > WA_WINDOW_MS) {
		return {
			open: false,
			reason: "outside_24h_window",
			message:
				"Outside the WhatsApp 24h customer-care window. A template would be required. Nhịp v1 does not invent templates. Free-form send refused.",
		};
	}
	return { open: true, reason: null };
}

function asId(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}
	return "";
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
	return value && typeof value === "object" ? (value as Json) : {};
}

/**
 * Webhook schemas are deliberately loose. Meta and Zalo add fields and whole message types
 * without notice, so a schema that demands the payload it saw last quarter makes this more
 * fragile, not less. Three rules hold throughout:
 *
 * 1. Only fields the parser actually reads are declared; unknown keys are dropped.
 * 2. Decorative fields carry `.catch(undefined)`, so an unexpected shape reads as absent
 *    rather than sinking the message that contains it.
 * 3. Lists stay `unknown[]` and each member is parsed on its own, so one malformed entry,
 *    change or message is skipped individually instead of rejecting the whole batch.
 *
 * Every entry point uses `safeParse`, so an unparseable body yields `[]` and never throws.
 */

/** An optional vendor field that never sinks the message it belongs to. */
const looseString = z.string().optional().catch(undefined);

/** `timestamp` stays `unknown` on purpose: the `at` handling below is intentionally permissive. */
const looseTimestamp = z.unknown().optional();

const looseList = z.array(z.unknown()).optional().catch(undefined);

const looseText = z.object({ body: z.string() }).optional().catch(undefined);

const whatsappWebhook = z.object({ entry: looseList });
const whatsappEntry = z.object({ changes: looseList });
const whatsappChange = z.object({
	value: z.object({
		metadata: z.object({ phone_number_id: looseString }).optional().catch(undefined),
		contacts: looseList,
		messages: looseList,
		smb_message_echoes: looseList,
	}),
});
const whatsappContact = z.object({
	wa_id: z.string(),
	profile: z.object({ name: looseString }).optional().catch(undefined),
});
const whatsappMessage = z.object({
	from: z.string(),
	id: looseString,
	timestamp: looseTimestamp,
	text: looseText,
});
const whatsappEcho = z.object({
	to: looseString,
	recipient: looseString,
	id: looseString,
	timestamp: looseTimestamp,
	text: looseText,
});

export function parseWhatsAppWebhook(body: unknown): InboundEvent[] {
	const events: InboundEvent[] = [];
	const root = whatsappWebhook.safeParse(body);
	if (!root.success) return events;
	for (const rawEntry of root.data.entry ?? []) {
		const entry = whatsappEntry.safeParse(rawEntry);
		if (!entry.success) continue;
		for (const rawChange of entry.data.changes ?? []) {
			const change = whatsappChange.safeParse(rawChange);
			if (!change.success) continue;
			const value = change.data.value;
			const nameByWa: Record<string, string | null> = {};
			for (const raw of value.contacts ?? []) {
				const contact = whatsappContact.safeParse(raw);
				if (!contact.success) continue;
				nameByWa[contact.data.wa_id] = contact.data.profile?.name ?? null;
			}
			for (const raw of value.messages ?? []) {
				const parsed = whatsappMessage.safeParse(raw);
				if (!parsed.success) continue;
				const msg = parsed.data;
				const text = msg.text?.body ?? null;
				if (!text) continue;
				events.push({
					pipe: "whatsapp",
					source: "guest",
					guestId: msg.from,
					guestName: nameByWa[msg.from] || null,
					text,
					vendorMessageId: msg.id ?? null,
					at: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
					phoneNumberId: value.metadata?.phone_number_id ?? null,
				});
			}
			for (const raw of value.smb_message_echoes ?? []) {
				const parsed = whatsappEcho.safeParse(raw);
				if (!parsed.success) continue;
				const echo = parsed.data;
				const text = echo.text?.body ?? null;
				if (!text) continue;
				events.push({
					pipe: "whatsapp",
					source: "oa-echo",
					guestId: echo.to ?? echo.recipient ?? "unknown",
					guestName: null,
					text,
					vendorMessageId: echo.id ?? null,
					at: echo.timestamp ? Number(echo.timestamp) * 1000 : Date.now(),
				});
			}
		}
	}
	return events;
}

/** Zalo sends ids as either a string or a number; both stringify to the same guest id. */
const zaloParty = z
	.object({ id: z.union([z.string(), z.number()]) })
	.optional()
	.catch(undefined);

const zaloWebhook = z.object({
	event_name: z.string(),
	timestamp: looseTimestamp,
	message: z.object({ text: z.string(), msg_id: looseString }).optional().catch(undefined),
	sender: zaloParty,
	recipient: zaloParty,
});

export function parseZaloWebhook(body: unknown): InboundEvent[] {
	const parsed = zaloWebhook.safeParse(body);
	if (!parsed.success) return [];
	const root = parsed.data;
	const text = root.message?.text ?? null;
	if (!text) return [];

	const party =
		root.event_name === "user_send_text"
			? root.sender
			: root.event_name === "oa_send_text"
				? root.recipient
				: null;
	if (!party) return [];
	const guestId = String(party.id);
	if (!guestId) return [];

	return [
		{
			pipe: "zalo",
			source: root.event_name === "user_send_text" ? "guest" : "oa-echo",
			guestId,
			guestName: null,
			text,
			vendorMessageId: root.message?.msg_id ?? null,
			at: root.timestamp ? Number(root.timestamp) : Date.now(),
		},
	];
}

function hexEqual(provided: string, expected: string): boolean {
	if (!/^[0-9a-f]+$/i.test(provided)) return false;
	const a = Buffer.from(provided, "hex");
	const b = Buffer.from(expected, "hex");
	if (a.length !== b.length) return false;
	return crypto.timingSafeEqual(a, b);
}

/**
 * Meta signs the raw body with HMAC-SHA256 using the app secret
 * (`X-Hub-Signature-256: sha256=<hex>`). Fails closed: no secret means no inbound.
 */
export function verifyWhatsAppSignature(
	rawBody: string | Buffer,
	signatureHeader: string | null,
	appSecret: string | undefined,
): boolean {
	if (!appSecret) return false;
	if (!signatureHeader) return false;
	const provided = signatureHeader.replace(/^sha256=/, "").trim();
	const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
	return hexEqual(provided, expected);
}

/**
 * Zalo OA signs webhooks as `X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + OAsecretKey)`
 * where `appId` and `timestamp` are the `app_id` and `timestamp` fields of the body.
 * Fails closed: no secret means no inbound.
 */
export function verifyZaloSignature(
	rawBody: string,
	signatureHeader: string | null,
	oaSecretKey: string | undefined,
): boolean {
	if (!oaSecretKey) return false;
	if (!signatureHeader) return false;
	let body: Json;
	try {
		body = asRecord(JSON.parse(rawBody) as unknown);
	} catch {
		return false;
	}
	const appId = asId(body.app_id);
	const timestamp = asId(body.timestamp);
	if (!appId || !timestamp) return false;
	const provided = signatureHeader.replace(/^mac=/, "").trim();
	const expected = crypto
		.createHash("sha256")
		.update(`${appId}${rawBody}${timestamp}${oaSecretKey}`)
		.digest("hex");
	return hexEqual(provided, expected);
}

class SendError extends Error {
	detail: unknown;
	constructor(message: string, detail: unknown) {
		super(message);
		this.detail = detail;
	}
}

async function sendWhatsApp(input: {
	to: string;
	text: string;
	accessToken: string;
	phoneNumberId: string;
}): Promise<SendResult> {
	const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${input.accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			messaging_product: "whatsapp",
			to: input.to,
			type: "text",
			text: { body: input.text },
		}),
	});
	const body = (await res.json().catch(() => ({}))) as Json;
	if (!res.ok) throw new SendError("WhatsApp send failed", body);
	const messages = Array.isArray(body.messages) ? body.messages : [];
	const first = asRecord(messages[0]);
	return {
		mock: false,
		pipe: "whatsapp",
		to: input.to,
		vendorMessageId: typeof first.id === "string" ? first.id : null,
	};
}

async function sendZalo(input: {
	to: string;
	text: string;
	accessToken: string;
}): Promise<SendResult> {
	const url = "https://openapi.zalo.me/v3.0/oa/message/cs";
	const res = await fetch(url, {
		method: "POST",
		headers: {
			access_token: input.accessToken,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			recipient: { user_id: input.to },
			message: { text: input.text },
		}),
	});
	const body = (await res.json().catch(() => ({}))) as Json;
	if (!res.ok || (body.error && body.error !== 0)) {
		throw new SendError("Zalo send failed", body);
	}
	const data = asRecord(body.data);
	return {
		mock: false,
		pipe: "zalo",
		to: input.to,
		vendorMessageId: typeof data.message_id === "string" ? data.message_id : null,
	};
}

export async function transmit(input: {
	conversation: Conversation;
	text: string;
	config: InboxConfig;
}): Promise<SendResult> {
	const pipe: Pipe = input.conversation.pipe;
	const to = input.conversation.guestId;
	if (input.config.sendMode !== "live") {
		return {
			mock: true,
			pipe,
			to,
			text: input.text,
			vendorMessageId: `mock-${Date.now()}`,
		};
	}

	if (pipe === "whatsapp") {
		const { accessToken, phoneNumberId } = input.config.whatsapp;
		if (!accessToken || !phoneNumberId) {
			throw new Error(
				"WhatsApp live send needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
			);
		}
		return sendWhatsApp({ to, text: input.text, accessToken, phoneNumberId });
	}

	const accessToken = input.config.zalo.accessToken;
	if (!accessToken) {
		throw new Error("Zalo live send needs ZALO_OA_ACCESS_TOKEN");
	}
	return sendZalo({ to, text: input.text, accessToken });
}

export { SendError };
