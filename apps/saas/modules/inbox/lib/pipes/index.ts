import type { InboxConfig } from "../config";
import type { Conversation, InboundEvent, Pipe, SendResult } from "../types";
import {
	parseWhatsAppWebhook,
	parseZaloWebhook,
	SendError,
	sendWhatsApp,
	sendZalo,
	verifyWhatsAppSignature,
	verifyZaloSignature,
	whatsappWindowState,
	type WindowState,
} from "./vendors";

/**
 * One adapter per pipe. Each owns everything vendor-specific about that pipe: how an
 * inbound is verified and parsed, whether a send is allowed right now, and how a
 * message goes out. Route handlers name the pipe; nothing else restates it.
 */
export type PipeAdapter = {
	pipe: Pipe;
	/** Fail closed: a missing secret rejects every inbound. */
	verifyInbound(rawBody: string, headers: Headers, config: InboxConfig): boolean;
	parseInbound(body: unknown): InboundEvent[];
	/** Vendor rules on when a free-form send is allowed (WhatsApp's 24h window). */
	sendWindow(conversation: Conversation, now?: number): WindowState;
	/**
	 * Whether this deployment's credentials can send from the office's number or OA the
	 * guest wrote to (ADR 0010). Credentials are process-wide for the pilot, so a thread
	 * that arrived on any other endpoint must be refused rather than answered from the
	 * wrong identity.
	 */
	ownsEndpoint(pipeExternalId: string, config: InboxConfig): boolean;
	/** Talks to the vendor. Only called when the send mode is live. */
	send(input: { to: string; text: string; config: InboxConfig }): Promise<SendResult>;
};

const whatsapp: PipeAdapter = {
	pipe: "whatsapp",
	verifyInbound: (rawBody, headers, config) =>
		verifyWhatsAppSignature(rawBody, headers.get("x-hub-signature-256"), config.whatsapp.appSecret),
	parseInbound: parseWhatsAppWebhook,
	sendWindow: (conversation, now) => whatsappWindowState(conversation, now),
	ownsEndpoint: (pipeExternalId, config) => config.whatsapp.phoneNumberId === pipeExternalId,
	send: async ({ to, text, config }) => {
		const { accessToken, phoneNumberId } = config.whatsapp;
		if (!accessToken || !phoneNumberId) {
			throw new Error(
				"WhatsApp live send needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
			);
		}
		return sendWhatsApp({ to, text, accessToken, phoneNumberId });
	},
};

const zalo: PipeAdapter = {
	pipe: "zalo",
	verifyInbound: (rawBody, headers, config) =>
		verifyZaloSignature(rawBody, headers.get("x-zevent-signature"), config.zalo.oaSecretKey),
	parseInbound: parseZaloWebhook,
	sendWindow: () => ({ open: true, reason: null }),
	// Zalo's token is per OA; ZALO_OA_ID says which one. Unset means "not checked".
	ownsEndpoint: (pipeExternalId, config) =>
		!config.zalo.oaId || config.zalo.oaId === pipeExternalId,
	send: async ({ to, text, config }) => {
		const accessToken = config.zalo.accessToken;
		if (!accessToken) {
			throw new Error("Zalo live send needs ZALO_OA_ACCESS_TOKEN");
		}
		return sendZalo({ to, text, accessToken });
	},
};

const adapters: Record<Pipe, PipeAdapter> = { whatsapp, zalo };

export function pipeAdapter(pipe: Pipe): PipeAdapter {
	return adapters[pipe];
}

/**
 * The mock | live seam. Mock never touches a vendor, whatever credentials exist; live
 * delegates to the pipe's adapter. `resolveSendMode` guarantees `sendMode` is only
 * `live` for the exact string "live".
 */
export async function transmit(input: {
	conversation: Conversation;
	text: string;
	config: InboxConfig;
}): Promise<SendResult> {
	const pipe = input.conversation.pipe;
	const to = input.conversation.guestId;
	if (input.config.sendMode !== "live") {
		return { mock: true, pipe, to, text: input.text, vendorMessageId: `mock-${Date.now()}` };
	}
	return pipeAdapter(pipe).send({ to, text: input.text, config: input.config });
}

export { SendError, type WindowState };
