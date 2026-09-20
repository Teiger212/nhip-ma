import { runInBackground } from "./background";
import { draftReply, followUpTemplate, oneShot } from "./draft";
import { checkFollowUp } from "./drafts/guardrails";
import { pipeAdapter, SendError, transmit } from "./pipes";
import { getRuntime, type Runtime } from "./runtime";
import { scheduleTranslations } from "./translate";
import type { Conversation, InboundEvent, InboxViewer, Pipe, SendResult, Store } from "./types";

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

/**
 * Webhook events are filed under the office that owns the pipe they arrived on
 * (ADR 0008). An event from a pipe no office has connected is dropped, not filed under
 * nobody: tenancy fails closed, and the log says which pipe to connect.
 */
export async function ingestEvents(runtime: Runtime, events: InboundEvent[]): Promise<void> {
	for (const event of events) {
		const officeId = event.pipeExternalId
			? await runtime.store.officeForPipe(event.pipe, event.pipeExternalId)
			: null;
		if (!officeId) {
			console.warn("inbox: inbound dropped, no office owns this pipe", {
				pipe: event.pipe,
				pipeExternalId: event.pipeExternalId ?? null,
			});
			continue;
		}
		const conv = await runtime.store.upsertInbound(event, officeId);
		if (event.source === "guest") {
			await afterGuestInbound(runtime, conv);
		}
	}
}

export async function injectDevInbound(input: {
	pipe: Pipe;
	guestId: string;
	text: string;
	officeId: string;
	guestName?: string | null;
	vendorMessageId?: string | null;
	at?: number | string | Date;
}): Promise<Conversation> {
	const runtime = getRuntime();
	const conv = await runtime.store.upsertInbound(
		{
			pipe: input.pipe,
			guestId: input.guestId,
			guestName: input.guestName || null,
			text: input.text,
			vendorMessageId: input.vendorMessageId || null,
			at: input.at || Date.now(),
			source: "guest",
		},
		input.officeId,
	);
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

/** The office number or OA the guest last wrote to, if the pipe told us. */
function latestGuestEndpoint(conversation: Conversation): string | null {
	for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
		const message = conversation.messages[i];
		if (message.direction === "in") {
			return message.pipeExternalId;
		}
	}
	return null;
}

const ALREADY_ANSWERED: InboxResult = {
	ok: false,
	status: 409,
	error: "already_answered",
	message:
		"Every guest message in this thread has been answered. Wait for the guest to write back.",
};

const DELIVERY_UNKNOWN_MESSAGE =
	"A previous send of this reply was not confirmed by the vendor. Check whether it arrived before sending again.";

const DELIVERY_UNKNOWN: InboxResult = {
	ok: false,
	status: 409,
	error: "delivery_unknown",
	message: DELIVERY_UNKNOWN_MESSAGE,
};

/** Whether the guest's latest message has an Answer whose delivery nobody has confirmed. */
function hasUnknownAnswer(conversation: Conversation): boolean {
	for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
		const message = conversation.messages[i];
		if (message.direction === "in") {
			return conversation.answers.some(
				(answer) => answer.inboundId === message.id && answer.status === "unknown",
			);
		}
	}
	return false;
}

export type ApproveInput = {
	/** The guest message the operator is answering. Required: an approval names its target. */
	inboundId: string | undefined;
	/** Exactly the text the operator approved. Blank is refused, never filled in. */
	text: string | undefined;
};

/**
 * Approve and send (CONTEXT.md): one human approving one reply for one inbound message.
 * Reply-only (ADR 0006): the send answers the unanswered inbound, and a second approve
 * against the same inbound is refused. The Answer (ADR 0011) is on record before any
 * vendor is called, so nothing that happens between approval and acknowledgement can
 * send the wrong text, send twice, or hide a guest message that lands in between.
 */
export async function approveAndSend(
	id: string,
	input: ApproveInput,
	viewer?: InboxViewer,
): Promise<InboxResult> {
	const { store, config } = getRuntime();
	const conv = await store.getConversation(id, viewer);
	if (!conv) {
		return { ok: false, status: 404, error: "not_found" };
	}
	const inboundId = conv.unansweredInboundId;
	if (!inboundId) {
		// Nothing open. If that is because a send's outcome is unknown, say so: the operator
		// has something to check, not a guest who has been answered.
		return hasUnknownAnswer(conv) ? DELIVERY_UNKNOWN : ALREADY_ANSWERED;
	}
	if (!input.inboundId) {
		return {
			ok: false,
			status: 400,
			error: "inbound_required",
			message: "An approval must name the guest message it answers.",
		};
	}
	if (input.inboundId !== inboundId) {
		return {
			ok: false,
			status: 409,
			error: "stale_target",
			message: "The guest wrote again since this reply was drafted. Review the new message.",
		};
	}
	const text = input.text?.trim();
	if (!text) {
		return {
			ok: false,
			status: 400,
			error: "empty_reply",
			message: "The reply is empty. Nothing was sent.",
		};
	}

	const adapter = pipeAdapter(conv.pipe);
	const window = adapter.sendWindow(conv);
	if (!window.open) {
		return {
			ok: false,
			status: 409,
			error: window.reason,
			message: window.message,
		};
	}

	// The reply goes out on the number the guest wrote to (ADR 0010). With process-wide
	// credentials, a thread that arrived on any other number cannot be answered from here.
	const endpoint = latestGuestEndpoint(conv);
	if (config.sendMode === "live" && endpoint && !adapter.ownsEndpoint(endpoint, config)) {
		return {
			ok: false,
			status: 409,
			error: "pipe_not_configured",
			message:
				"This thread arrived on a number or OA this deployment is not configured to send from.",
		};
	}

	// The Answer is written before the vendor call. Its unique inbound is the guard against
	// a concurrent approval; its status is what decides whether a retry is ever allowed.
	const begun = await store.beginAnswer({
		conversationId: conv.id,
		inboundId,
		text,
		operatorId: viewer?.userId ?? null,
	});
	if (!begun.ok) {
		switch (begun.reason) {
			case "already_answered":
				return ALREADY_ANSWERED;
			case "in_progress":
				return {
					ok: false,
					status: 409,
					error: "send_in_progress",
					message: "This message is being sent by another approval.",
				};
			case "unknown":
				return DELIVERY_UNKNOWN;
		}
	}
	const answerId = begun.answer.id;

	let result: SendResult;
	try {
		result = await transmit({ conversation: conv, text, config });
	} catch (err) {
		const message = err instanceof Error ? err.message : "send failed";
		if (err instanceof SendError) {
			// The vendor refused, or nothing was sent: a definite failure the operator may retry.
			await store.failAnswer(answerId, message);
			return { ok: false, status: 502, error: "send_failed", message, detail: err.detail };
		}
		// A network failure or timeout: the vendor may or may not have the message. Never
		// retried automatically, and never approved again until a person has checked.
		await store.markAnswerUnknown(answerId, message);
		return {
			ok: false,
			status: 502,
			error: "delivery_unknown",
			message: `${DELIVERY_UNKNOWN_MESSAGE} (${message})`,
		};
	}

	try {
		const updated = await store.completeAnswer(answerId, result);
		if (!updated) {
			return { ok: false, status: 404, error: "not_found" };
		}
		return { ok: true, conversation: updated };
	} catch (err) {
		// The vendor accepted but the record failed. The Answer stays on file as unknown, so
		// the reply is not sent a second time; someone reconciles it against the vendor.
		const message = err instanceof Error ? err.message : "record failed";
		await store.markAnswerUnknown(answerId, `recorded_failed: ${message}`).catch(() => undefined);
		return {
			ok: false,
			status: 500,
			error: "record_failed",
			message: "The reply was sent but could not be recorded. It will not be sent again.",
		};
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
