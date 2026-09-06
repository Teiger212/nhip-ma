import crypto from "crypto";

import type { Conversation, InboundEvent, Pipe, SendResult, InboxEnv } from "./types";

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

export function parseWhatsAppWebhook(body: unknown): InboundEvent[] {
	const events: InboundEvent[] = [];
	const root = asRecord(body);
	const entries = Array.isArray(root.entry) ? root.entry : [];
	for (const entry of entries) {
		const changes = Array.isArray(asRecord(entry).changes)
			? (asRecord(entry).changes as unknown[])
			: [];
		for (const change of changes) {
			const value = asRecord(asRecord(change).value);
			const metadata = asRecord(value.metadata);
			const contacts = Array.isArray(value.contacts) ? value.contacts : [];
			const nameByWa: Record<string, string | null> = {};
			for (const raw of contacts) {
				const c = asRecord(raw);
				if (typeof c.wa_id === "string") {
					const profile = asRecord(c.profile);
					nameByWa[c.wa_id] = typeof profile.name === "string" ? profile.name : null;
				}
			}
			const messages = Array.isArray(value.messages) ? value.messages : [];
			for (const raw of messages) {
				const msg = asRecord(raw);
				const textObj = asRecord(msg.text);
				const text = typeof textObj.body === "string" ? textObj.body : null;
				if (!text || typeof msg.from !== "string") continue;
				events.push({
					pipe: "whatsapp",
					source: "guest",
					guestId: msg.from,
					guestName: nameByWa[msg.from] || null,
					text,
					vendorMessageId: typeof msg.id === "string" ? msg.id : null,
					at: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
					phoneNumberId:
						typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : null,
				});
			}
			const echoes = Array.isArray(value.smb_message_echoes) ? value.smb_message_echoes : [];
			for (const raw of echoes) {
				const echo = asRecord(raw);
				const textObj = asRecord(echo.text);
				const text = typeof textObj.body === "string" ? textObj.body : null;
				if (!text) continue;
				const guestId =
					typeof echo.to === "string"
						? echo.to
						: typeof echo.recipient === "string"
							? echo.recipient
							: "unknown";
				events.push({
					pipe: "whatsapp",
					source: "oa-echo",
					guestId,
					guestName: null,
					text,
					vendorMessageId: typeof echo.id === "string" ? echo.id : null,
					at: echo.timestamp ? Number(echo.timestamp) * 1000 : Date.now(),
				});
			}
		}
	}
	return events;
}

export function parseZaloWebhook(body: unknown): InboundEvent[] {
	const root = asRecord(body);
	if (typeof root.event_name !== "string") return [];
	const message = asRecord(root.message);
	const text = typeof message.text === "string" ? message.text : null;
	if (!text) return [];

	if (root.event_name === "user_send_text") {
		const sender = asRecord(root.sender);
		if (sender.id === undefined || sender.id === null) return [];
		const guestId = asId(sender.id);
		if (!guestId) return [];
		return [
			{
				pipe: "zalo",
				source: "guest",
				guestId,
				guestName: null,
				text,
				vendorMessageId: typeof message.msg_id === "string" ? message.msg_id : null,
				at: root.timestamp ? Number(root.timestamp) : Date.now(),
			},
		];
	}

	if (root.event_name === "oa_send_text") {
		const recipient = asRecord(root.recipient);
		if (recipient.id === undefined || recipient.id === null) return [];
		const guestId = asId(recipient.id);
		if (!guestId) return [];
		return [
			{
				pipe: "zalo",
				source: "oa-echo",
				guestId,
				guestName: null,
				text,
				vendorMessageId: typeof message.msg_id === "string" ? message.msg_id : null,
				at: root.timestamp ? Number(root.timestamp) : Date.now(),
			},
		];
	}

	return [];
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
	mode: string;
	env: InboxEnv;
}): Promise<SendResult> {
	const pipe: Pipe = input.conversation.pipe;
	const to = input.conversation.guestId;
	if (input.mode !== "live") {
		return {
			mock: true,
			pipe,
			to,
			text: input.text,
			vendorMessageId: `mock-${Date.now()}`,
		};
	}

	if (pipe === "whatsapp") {
		const accessToken = input.env.WHATSAPP_ACCESS_TOKEN;
		const phoneNumberId = input.env.WHATSAPP_PHONE_NUMBER_ID;
		if (!accessToken || !phoneNumberId) {
			throw new Error(
				"WhatsApp live send needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
			);
		}
		return sendWhatsApp({ to, text: input.text, accessToken, phoneNumberId });
	}

	const accessToken = input.env.ZALO_OA_ACCESS_TOKEN;
	if (!accessToken) {
		throw new Error("Zalo live send needs ZALO_OA_ACCESS_TOKEN");
	}
	return sendZalo({ to, text: input.text, accessToken });
}

export { SendError };
