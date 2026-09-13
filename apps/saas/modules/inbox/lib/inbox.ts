import { oneShot } from "./draft";
import { pipeAdapter, SendError, transmit } from "./pipes";
import { getRuntime } from "./runtime";
import type { Conversation, InboundEvent, InboxViewer, Pipe, Store } from "./types";

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

export async function ingestEvents(
	store: Store,
	events: InboundEvent[],
	ownerUserId: string | null = null,
): Promise<void> {
	for (const event of events) {
		const conv = await store.upsertInbound({
			...event,
			ownerUserId: event.ownerUserId ?? ownerUserId,
		});
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
	ownerUserId?: string | null;
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
		ownerUserId: input.ownerUserId ?? null,
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

export async function approveAndSend(
	id: string,
	replyOverride?: string,
	viewer?: InboxViewer,
): Promise<ApproveResult> {
	const { store, config } = getRuntime();
	const conv = await store.getConversation(id, viewer);
	if (!conv) {
		return { ok: false, status: 404, error: "not_found" };
	}
	if (conv.sentAt) {
		return {
			ok: false,
			status: 409,
			error: "already_sent",
			message: "This thread was already approved and sent.",
		};
	}
	if (!conv.oneShot?.draft?.reply) {
		return { ok: false, status: 400, error: "no_draft" };
	}

	const window = pipeAdapter(conv.pipe).sendWindow(conv);
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

	// Compare-and-swap before the network call so two concurrent approvals cannot both
	// transmit. The `sentAt` read above is only a fast path; this is the real guard.
	const claimed = await store.claimSend(conv.id);
	if (!claimed) {
		return {
			ok: false,
			status: 409,
			error: "already_sent",
			message: "This thread was already approved and sent.",
		};
	}

	try {
		const result = await transmit({ conversation: conv, text, config });
		const updated = await store.recordApprovedSend(conv.id, text, result);
		if (!updated) {
			return { ok: false, status: 404, error: "not_found" };
		}
		return { ok: true, conversation: updated };
	} catch (err) {
		await store.releaseSend(conv.id);
		const message = err instanceof Error ? err.message : "send failed";
		const detail = err instanceof SendError ? err.detail : null;
		return { ok: false, status: 502, error: "send_failed", message, detail };
	}
}
