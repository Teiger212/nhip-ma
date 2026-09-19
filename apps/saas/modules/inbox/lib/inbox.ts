import { runInBackground } from "./background";
import { draftReply, followUpTemplate, oneShot } from "./draft";
import { checkFollowUp } from "./drafts/guardrails";
import { pipeAdapter, SendError, transmit } from "./pipes";
import { getRuntime, type Runtime } from "./runtime";
import { scheduleTranslations } from "./translate";
import type { Conversation, InboundEvent, InboxViewer, Pipe, Store } from "./types";

/**
 * The deterministic pass after a guest message. The template in the reply box is the
 * first-reply template for a new lead and the follow-up template once the office has
 * sent; the model draft (ADR 0005) replaces the latter when it lands.
 */
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
	const shot = oneShot(inbound, conversation.unansweredInboundId);
	if (conversation.sentAt) {
		shot.draft.reply = followUpTemplate(shot.language);
	}
	return store.setOneShot(conversation.id, shot);
}

/**
 * Ask the model for a follow-up from the whole conversation and store it as the suggested
 * reply, unless the guest message was answered in the meantime (a stale draft must never
 * overwrite the next inbound's). Returns null when the template stands.
 */
export async function generateModelDraft(
	runtime: Runtime,
	conversation: Conversation,
): Promise<Conversation | null> {
	const inboundId = conversation.unansweredInboundId;
	const shot = conversation.oneShot;
	if (!inboundId || !shot) {
		return null;
	}
	const raw = await runtime.drafts.followUp({
		guestName: conversation.guestName,
		guestLanguage: shot.language,
		messages: conversation.messages,
		qualification: shot.qualification,
		paperwork: shot.paperwork,
	});
	const reply = checkFollowUp(raw);
	if (!reply) {
		return null;
	}
	const current = await runtime.store.getConversation(conversation.id);
	if (!current || current.unansweredInboundId !== inboundId) {
		return null;
	}
	return runtime.store.setDraft(conversation.id, {
		reply,
		answersMessageId: inboundId,
		source: "model",
	});
}

/**
 * Everything that follows a guest message: the one-shot now, then translation and, for a
 * guest who wrote back after a send, the model draft in the background. The first reply
 * keeps the template until the model draft is shown to be better on the invented threads
 * (ADR 0005).
 */
export async function afterGuestInbound(
	runtime: Runtime,
	conversation: Conversation,
): Promise<Conversation> {
	const updated = (await applyOneShot(runtime.store, conversation)) ?? conversation;
	const inbound = updated.messages.find((message) => message.id === updated.unansweredInboundId);
	if (inbound) {
		scheduleTranslations(runtime, inbound);
		if (updated.sentAt && updated.oneShot && runtime.drafts.provider !== "none") {
			void runInBackground(`follow-up draft ${updated.id}`, async () => {
				await generateModelDraft(runtime, updated);
			});
		}
	}
	return updated;
}

export async function ingestEvents(
	runtime: Runtime,
	events: InboundEvent[],
	ownerUserId: string | null = null,
): Promise<void> {
	for (const event of events) {
		const conv = await runtime.store.upsertInbound({
			...event,
			ownerUserId: event.ownerUserId ?? ownerUserId,
		});
		if (event.source === "guest") {
			await afterGuestInbound(runtime, conv);
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
	const runtime = getRuntime();
	const conv = await runtime.store.upsertInbound({
		pipe: input.pipe,
		guestId: input.guestId,
		guestName: input.guestName || null,
		text: input.text,
		vendorMessageId: input.vendorMessageId || null,
		at: input.at || Date.now(),
		source: "guest",
		ownerUserId: input.ownerUserId ?? null,
	});
	return afterGuestInbound(runtime, conv);
}

export type InboxResult =
	| { ok: true; conversation: Conversation }
	| {
			ok: false;
			status: number;
			error: string;
			message?: string;
			detail?: unknown;
	  };

/** @deprecated Use InboxResult */
export type ApproveResult = InboxResult;

const ALREADY_ANSWERED: InboxResult = {
	ok: false,
	status: 409,
	error: "already_answered",
	message:
		"Every guest message in this thread has been answered. Wait for the guest to write back.",
};

/**
 * Approve and send (CONTEXT.md): one human approving one reply for one inbound message.
 * Reply-only (ADR 0006): the send answers the unanswered inbound, and a second approve
 * against the same inbound is refused.
 */
export async function approveAndSend(
	id: string,
	replyOverride?: string,
	viewer?: InboxViewer,
): Promise<InboxResult> {
	const { store, config } = getRuntime();
	const conv = await store.getConversation(id, viewer);
	if (!conv) {
		return { ok: false, status: 404, error: "not_found" };
	}
	const inboundId = conv.unansweredInboundId;
	if (!inboundId) {
		return ALREADY_ANSWERED;
	}
	const text =
		typeof replyOverride === "string" && replyOverride.trim()
			? replyOverride.trim()
			: conv.oneShot?.draft?.reply;
	if (!text) {
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

	// Compare-and-swap on the inbound message before the network call so two concurrent
	// approvals cannot both transmit. The read above is only a fast path; this is the guard.
	const claimed = await store.claimSend(inboundId);
	if (!claimed) {
		return ALREADY_ANSWERED;
	}

	try {
		const result = await transmit({ conversation: conv, text, config });
		const updated = await store.recordApprovedSend(conv.id, text, result, inboundId);
		if (!updated) {
			return { ok: false, status: 404, error: "not_found" };
		}
		return { ok: true, conversation: updated };
	} catch (err) {
		await store.releaseSend(inboundId);
		const message = err instanceof Error ? err.message : "send failed";
		const detail = err instanceof SendError ? err.detail : null;
		return { ok: false, status: 502, error: "send_failed", message, detail };
	}
}

/**
 * The operator asks for a new suggestion (ADR 0005). This is the one place a first reply
 * goes to the model: the automatic path keeps the template, an explicit request does not.
 * Without a model, or when the model's draft fails the post-check, the template is put
 * back so the box is never empty.
 */
export async function regenerateDraft(id: string, viewer?: InboxViewer): Promise<InboxResult> {
	const runtime = getRuntime();
	const conv = await runtime.store.getConversation(id, viewer);
	if (!conv) {
		return { ok: false, status: 404, error: "not_found" };
	}
	if (!conv.unansweredInboundId) {
		return ALREADY_ANSWERED;
	}
	if (!conv.oneShot) {
		return { ok: false, status: 400, error: "no_draft" };
	}
	const drafted = await generateModelDraft(runtime, conv);
	if (drafted) {
		return { ok: true, conversation: drafted };
	}
	const shot = conv.oneShot;
	const reply = conv.sentAt
		? followUpTemplate(shot.language)
		: draftReply(shot.language, shot.qualification);
	const updated = await runtime.store.setDraft(conv.id, {
		reply,
		answersMessageId: conv.unansweredInboundId,
		source: "template",
	});
	if (!updated) {
		return { ok: false, status: 404, error: "not_found" };
	}
	return { ok: true, conversation: updated };
}
