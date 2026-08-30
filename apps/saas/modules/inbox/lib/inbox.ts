import { oneShot } from "./draft";
import { SendError, transmit, whatsappWindowState } from "./pipes";
import { getRuntime } from "./runtime";
import type { Conversation, InboundEvent, Pipe, Store } from "./types";

export async function applyOneShot(
	store: Store,
	conversation: Conversation | null,
): Promise<Conversation | null> {
	if (!conversation) {
		return null;
	}
	const inbound = await store.guestInboundText(conversation.id);
	if (!inbound) {
		return conversation;
	}
	return store.setOneShot(conversation.id, oneShot(inbound));
}

export async function ingestEvents(store: Store, events: InboundEvent[]): Promise<void> {
	for (const event of events) {
		const conv = await store.upsertInbound(event);
		if (event.source === "guest") {
			await applyOneShot(store, conv);
		}
	}
}

export async function injectDevInbound(input: {
	pipe: Pipe;
	guestId: string;
	text: string;
	guestName?: string | null;
	vendorMessageId?: string | null;
	at?: number | string | Date;
}): Promise<Conversation> {
	const { store } = getRuntime();
	const conv = await store.upsertInbound({
		pipe: input.pipe,
		guestId: input.guestId,
		guestName: input.guestName || null,
		text: input.text,
		vendorMessageId: input.vendorMessageId || null,
		at: input.at || Date.now(),
		source: "guest",
	});
	const updated = await applyOneShot(store, conv);
	if (!updated) {
		throw new Error("failed to apply one-shot");
	}
	return updated;
}

export type ApproveResult =
	| { ok: true; conversation: Conversation }
	| {
			ok: false;
			status: number;
			error: string;
			message?: string;
			detail?: unknown;
	  };

export async function approveAndSend(id: string, replyOverride?: string): Promise<ApproveResult> {
	const { store, sendMode, env } = getRuntime();
	const conv = await store.getConversation(id);
	if (!conv) {
		return { ok: false, status: 404, error: "not_found" };
	}
	if (!conv.oneShot?.draft?.reply) {
		return { ok: false, status: 400, error: "no_draft" };
	}

	const window = whatsappWindowState(conv);
	if (!window.open) {
		return {
			ok: false,
			status: 409,
			error: window.reason,
			message: window.message,
		};
	}

	const text =
		typeof replyOverride === "string" && replyOverride.trim()
			? replyOverride.trim()
			: conv.oneShot.draft.reply;

	try {
		const result = await transmit({
			conversation: conv,
			text,
			mode: sendMode,
			env,
		});
		const updated = await store.recordApprovedSend(conv.id, text, result);
		if (!updated) {
			return { ok: false, status: 404, error: "not_found" };
		}
		return { ok: true, conversation: updated };
	} catch (err) {
		const message = err instanceof Error ? err.message : "send failed";
		const detail = err instanceof SendError ? err.detail : null;
		return { ok: false, status: 502, error: "send_failed", message, detail };
	}
}
