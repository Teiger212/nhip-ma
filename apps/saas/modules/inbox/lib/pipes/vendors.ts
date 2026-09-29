import crypto from "crypto";

import { z } from "zod";

import type { Conversation, InboundEvent, SendResult } from "../types";

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
					pipeExternalId: value.metadata?.phone_number_id ?? null,
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
					pipeExternalId: value.metadata?.phone_number_id ?? null,
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
	// The office's side of the pipe is the OA: the recipient of a guest message, the sender
	// of an OA echo. It is what maps the event to an office.
	const oa = root.event_name === "user_send_text" ? root.recipient : root.sender;
	const pipeExternalId = oa ? String(oa.id) : null;

	return [
		{
			pipe: "zalo",
			source: root.event_name === "user_send_text" ? "guest" : "oa-echo",
			guestId,
			guestName: null,
			text,
			vendorMessageId: root.message?.msg_id ?? null,
			at: root.timestamp ? Number(root.timestamp) : Date.now(),
			pipeExternalId,
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

/** How far a signed Zalo timestamp may be from now before the request counts as a replay. */
export const ZALO_SIGNATURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Zalo OA signs webhooks as `X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + OAsecretKey)`
 * where `appId` and `timestamp` are the `app_id` and `timestamp` fields of the body.
 * Fails closed: no secret means no inbound. A timestamp (milliseconds) outside
 * `ZALO_SIGNATURE_WINDOW_MS` of `now` is refused, so a captured request cannot be replayed.
 */
export function verifyZaloSignature(
	rawBody: string,
	signatureHeader: string | null,
	oaSecretKey: string | undefined,
	now: number = Date.now(),
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
	const signedAt = Number(timestamp);
	if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > ZALO_SIGNATURE_WINDOW_MS) {
		return false;
	}
	const provided = signatureHeader.replace(/^mac=/, "").trim();
	const expected = crypto
		.createHash("sha256")
		.update(`${appId}${rawBody}${timestamp}${oaSecretKey}`)
		.digest("hex");
	return hexEqual(provided, expected);
}

/**
 * A definite non-delivery: the vendor refused (`rejected`) or nothing was ever sent
 * because credentials are missing (`config`). Anything else thrown on the send path,
 * a network failure or a timeout, is ambiguous and is treated as such (ADR 0011).
 */
export class SendError extends Error {
	detail: unknown;
	kind: "rejected" | "config";
	constructor(message: string, detail: unknown, kind: "rejected" | "config" = "rejected") {
		super(message);
		this.detail = detail;
		this.kind = kind;
	}
}

export async function sendWhatsApp(input: {
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

const ZALO_OAUTH = "https://oauth.zaloapp.com/v4/oa";

/** What Zalo's OA token endpoint returns on success. */
export type ZaloTokens = { accessToken: string; refreshToken: string; expiresInSec: number };

/**
 * Zalo's OA token endpoint: form-encoded, the app secret in a `secret_key` header. It
 * answers failures with an error body (often HTTP 200), so success is an `access_token` in
 * the body, nothing else. Each call returns a new refresh token; the one sent is spent.
 */
async function zaloTokenRequest(
	appSecret: string,
	fields: Record<string, string>,
): Promise<ZaloTokens> {
	const res = await fetch(`${ZALO_OAUTH}/access_token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: appSecret },
		body: new URLSearchParams(fields).toString(),
		// Shorter than the credential lock's transaction timeout (20 s).
		signal: AbortSignal.timeout(10_000),
	});
	const body = (await res.json().catch(() => ({}))) as Json;
	const accessToken = typeof body.access_token === "string" ? body.access_token : null;
	const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : null;
	const expiresInSec = Number(body.expires_in);
	if (!accessToken || !refreshToken || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
		const error =
			typeof body.error === "number" || typeof body.error === "string" ? body.error : res.status;
		const message = typeof body.message === "string" ? body.message : "no token in response";
		throw new Error(`Zalo token request refused: ${String(error)} ${message}`.trim());
	}
	return { accessToken, refreshToken, expiresInSec };
}

export function refreshZaloToken(input: {
	appId: string;
	appSecret: string;
	refreshToken: string;
}): Promise<ZaloTokens> {
	return zaloTokenRequest(input.appSecret, {
		app_id: input.appId,
		grant_type: "refresh_token",
		refresh_token: input.refreshToken,
	});
}

/** The authorization code from the OA admin's consent, exchanged for the first token pair. */
export function exchangeZaloCode(input: {
	appId: string;
	appSecret: string;
	code: string;
	codeVerifier: string;
}): Promise<ZaloTokens> {
	return zaloTokenRequest(input.appSecret, {
		app_id: input.appId,
		grant_type: "authorization_code",
		code: input.code,
		code_verifier: input.codeVerifier,
	});
}

/** The OA a fresh access token belongs to (its id and display name). */
export async function zaloOaProfile(
	accessToken: string,
): Promise<{ oaId: string; name: string | null }> {
	const res = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", {
		headers: { access_token: accessToken },
		signal: AbortSignal.timeout(10_000),
	});
	const body = (await res.json().catch(() => ({}))) as Json;
	const data = asRecord(body.data);
	const oaId = asId(data.oa_id);
	if (!oaId) throw new Error("Zalo did not say which OA this token belongs to");
	return { oaId, name: typeof data.name === "string" ? data.name : null };
}

/** Where the OA admin consents to this app acting for the OA (PKCE, S256). */
export function zaloPermissionUrl(input: {
	appId: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
}): string {
	const url = new URL(`${ZALO_OAUTH}/permission`);
	url.searchParams.set("app_id", input.appId);
	url.searchParams.set("redirect_uri", input.redirectUri);
	url.searchParams.set("state", input.state);
	url.searchParams.set("code_challenge", input.codeChallenge);
	return url.toString();
}

export async function sendZalo(input: {
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
