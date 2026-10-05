import type { InboxConfig } from "../config";
import type { Conversation, InboundEvent, Pipe, SendResult, Store } from "../types";
import { notifyPipeDisconnected } from "./alerts";
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
import { ZaloDisconnectedError, zaloAccessToken } from "./zalo-token";

/**
 * Where an office's endpoint stands (ADR 0017): `connected` sends live (in a live
 * deployment), `disconnected` cannot send until the platform admin reconnects it, and
 * `not_connected` (demo threads, fake guests, a pipe the office never connected) is mocked.
 */
export type ConnectionState =
	| { state: "connected" }
	| { state: "disconnected"; reason: string }
	| { state: "not_connected" };

type PipeContext = { config: InboxConfig; store: Store };

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
	/** Where the endpoint stands for an office that holds it (see `connectionFor`). */
	connection(externalId: string, ctx: PipeContext): Promise<ConnectionState>;
	/** Talks to the vendor, from the office's endpoint. Only called for a connected endpoint. */
	send(input: { to: string; from: string; text: string } & PipeContext): Promise<SendResult>;
};

const whatsapp: PipeAdapter = {
	pipe: "whatsapp",
	verifyInbound: (rawBody, headers, config) =>
		verifyWhatsAppSignature(rawBody, headers.get("x-hub-signature-256"), config.whatsapp.appSecret),
	parseInbound: parseWhatsAppWebhook,
	sendWindow: (conversation, now) => whatsappWindowState(conversation, now),
	// WhatsApp still runs on the deployment's own number (env); its connections come later.
	connection: async (externalId, { config }) =>
		config.whatsapp.accessToken && config.whatsapp.phoneNumberId === externalId
			? { state: "connected" }
			: { state: "not_connected" },
	send: async ({ to, text, config }) => {
		const { accessToken, phoneNumberId } = config.whatsapp;
		if (!accessToken || !phoneNumberId) {
			throw new SendError(
				"WhatsApp live send needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
				null,
				"config",
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
	// Each OA's tokens are on its pipe connection (ADR 0017).
	connection: async (externalId, { store }) => {
		const credential = await store.pipeCredentialState("zalo", externalId);
		if (!credential) return { state: "not_connected" };
		if (credential.disconnectedAt) {
			return { state: "disconnected", reason: credential.disconnectedReason ?? "disconnected" };
		}
		return { state: "connected" };
	},
	send: async ({ to, from, text, config, store }) => {
		let accessToken: string;
		try {
			accessToken = await zaloAccessToken({ store, config, oaId: from });
		} catch (err) {
			if (err instanceof ZaloDisconnectedError && err.newly) {
				await notifyPipeDisconnected({ pipe: "zalo", externalId: from, reason: err.reason });
			}
			throw err;
		}
		return sendZalo({ to, text, accessToken });
	},
};

const adapters: Record<Pipe, PipeAdapter> = { whatsapp, zalo };

export function pipeAdapter(pipe: Pipe): PipeAdapter {
	return adapters[pipe];
}

/**
 * Where an office's endpoint stands, for that office. An endpoint another office holds now
 * (it was released and reconnected elsewhere) is not connected for this one, whatever
 * tokens it has: an office never sends as an endpoint it no longer holds (ADR 0017).
 */
export async function connectionFor(
	pipe: Pipe,
	externalId: string,
	officeId: string,
	ctx: PipeContext,
): Promise<ConnectionState> {
	const holder = await ctx.store.officeForPipe(pipe, externalId);
	if (holder !== officeId) return { state: "not_connected" };
	return pipeAdapter(pipe).connection(externalId, ctx);
}

/**
 * The mock | live seam (ADR 0017). Every send in a mock deployment is a mock send. In a live
 * deployment a send reaches the vendor only from a connected endpoint the thread's office
 * holds, and is refused otherwise (the approval path checks first and says why).
 */
export async function transmit(
	input: {
		conversation: Conversation;
		text: string;
		/** The office's endpoint the guest wrote to; null for threads with none (demo data). */
		from: string | null;
		/** The id a mock send reports; random unless the caller needs to know it (the auto-reply). */
		mockVendorMessageId?: string;
	} & PipeContext,
): Promise<SendResult> {
	const pipe = input.conversation.pipe;
	const to = input.conversation.guestId;
	if (input.config.sendMode !== "live") {
		return {
			mock: true,
			pipe,
			text: input.text,
			vendorMessageId: input.mockVendorMessageId ?? `mock-${crypto.randomUUID()}`,
		};
	}
	// Live: only from a connected endpoint the thread's office holds. No endpoint (a thread
	// from before endpoints were recorded) is refused too, never mocked.
	const connection = input.from
		? await connectionFor(pipe, input.from, input.conversation.officeId, input)
		: ({ state: "not_connected" } as const);
	if (connection.state !== "connected" || !input.from) {
		throw new SendError(
			`This ${pipe} thread cannot be answered from a connected number or OA`,
			null,
			"config",
		);
	}
	return pipeAdapter(pipe).send({
		to,
		from: input.from,
		text: input.text,
		config: input.config,
		store: input.store,
	});
}

export { SendError, type WindowState };
