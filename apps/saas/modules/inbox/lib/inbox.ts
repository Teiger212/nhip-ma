import { getBaseUrl } from "@shared/lib/base-url";

import { runInBackground } from "./background";
import { crmFailureKind } from "./crm/retry";
import { createCrmSync, logAccountLookupFailure } from "./crm/sync";
import { draftReply, followUpTemplate, oneShot } from "./draft";
import { checkFollowUp } from "./drafts/guardrails";
import { greetingTemplate } from "./greeting";
import { scheduleGuestAlert } from "./guest-alerts";
import type { AlertTransport } from "./guest-alerts/transport";
import { connectionFor, pipeAdapter, SendError, transmit } from "./pipes";
import { getRuntime, type Runtime } from "./runtime";
import { scheduleTranslations } from "./translate";
import type { Conversation, InboundEvent, InboxViewer, Pipe, SendResult, Store } from "./types";

/**
 * Whether the reply box takes the follow-up path (ADR 0005; ADR 0021, R11 and P2): once a human
 * reply was sent, or the auto-reply went out. A greeting claimed but never sent doesn't count:
 * that thread waits for a human with today's first-reply template.
 */
function takesFollowUpPath(conversation: Conversation): boolean {
	return (
		Boolean(conversation.sentAt) ||
		conversation.messages.some((message) => message.source === "auto-reply")
	);
}

/**
 * The deterministic pass after a guest message. The template in the reply box is the
 * first-reply template for a new lead, and the follow-up template once the office has sent
 * or greeted; the model draft (ADR 0005) replaces the latter when it lands.
 */
export async function applyOneShot(
	store: Store,
	conversation: Conversation | null,
): Promise<Conversation | null> {
	if (!conversation) {
		return null;
	}
	const inbound = await store.guestInboundText(conversation.officeId, conversation.id);
	if (!inbound) {
		return conversation;
	}
	const shot = oneShot(inbound, conversation.unansweredInboundId);
	const followsUp = takesFollowUpPath(conversation);
	if (followsUp) {
		shot.draft.reply = followUpTemplate(shot.language);
	}
	const stored = await store.setOneShot(conversation.officeId, conversation.id, shot);
	// The greeting landed after this message's thread was read, and its own redraft may already
	// have run: the first-reply template just written would stick, so take the follow-up path.
	if (stored && !followsUp && takesFollowUpPath(stored)) {
		return store.setDraft(stored.officeId, stored.id, {
			reply: followUpTemplate(shot.language),
			answersMessageId: stored.unansweredInboundId,
			source: "template",
		});
	}
	return stored;
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
	const current = await runtime.store.getOfficeConversation(conversation.officeId, conversation.id);
	if (!current || current.unansweredInboundId !== inboundId) {
		return null;
	}
	return runtime.store.setDraft(conversation.officeId, conversation.id, {
		reply,
		answersMessageId: inboundId,
		source: "model",
	});
}

/**
 * The address that opens a thread in Nhịp, written on its CRM lead (spec #59, Q12). Offices
 * are Vietnamese, so the link opens the Vietnamese inbox; the operator can switch from there.
 */
export function threadUrl(conversationId: string): string {
	return `${getBaseUrl()}/vi/inbox?thread=${encodeURIComponent(conversationId)}`;
}

/** The CRM sync (spec #59) over the runtime's store, with thread links and its key for CRM tokens. */
export function crmSyncFor(runtime: Runtime) {
	return createCrmSync({
		store: runtime.store,
		threadUrl,
		secretsKey: runtime.config.pipeSecretsKey,
	});
}

/**
 * A failed CRM lead write, logged by its kind only (#211): never the thread's, the guest's or
 * the CRM's ids, nor the CRM's message, which can echo guest data (PDPL).
 */
function logCrmWriteFailure(error: unknown): void {
	console.warn("crm: lead write failed", { kind: crmFailureKind(error) });
}

/** Threads whose lead retry runs in this instance now, so a burst of reads starts one (#211). */
const leadRetries = new Set<string>();

/**
 * On opening a thread (#211): a thread of an office with a CRM and no lead yet tries its lead
 * write again, in the background, once the wait stored since its last failure is over. A thread
 * already linked, or in an office with no CRM, costs nothing. The thread returned now is what
 * exists now; a lead written by this retry shows on the next poll.
 */
export function scheduleMissingLeadRetry(
	runtime: Runtime,
	conversation: Pick<Conversation, "id" | "officeId" | "crm" | "officeHasCrm">,
): void {
	if (!conversation.officeHasCrm || conversation.crm) return;
	const { id, officeId } = conversation;
	if (leadRetries.has(id)) return;
	leadRetries.add(id);
	void runInBackground("crm lead retry", async () => {
		try {
			await crmSyncFor(runtime).retryLead(officeId, id, new Date());
		} catch (error) {
			logCrmWriteFailure(error);
		}
	}).finally(() => {
		leadRetries.delete(id);
	});
}

/** How long an instance waits before asking an office's CRM about its account again (CRM 10). */
const ACCOUNT_LOOKUP_EVERY_MS = 10 * 60 * 1000;
/** When this instance last asked each office's CRM about its account, from a thread's opening. */
const accountLookups = new Map<string, number>();

/**
 * On opening a linked thread whose lead has no address in the CRM's web app (CRM 10): ask the
 * office's CRM, in the background, which account it is on, so "In CRM" opens the lead from the
 * next poll. This catches an office whose account was not learned when it connected (the CRM
 * slow or down then) or was learned before Nhịp kept the address. A CRM with no web app (the
 * mock) is never asked: `resolveAccount` reads the office's connection and stops. Once per office
 * per instance every ten minutes at most, whatever the answer, so a refused token is not asked on
 * every poll.
 */
export function scheduleMissingLeadAddress(
	runtime: Runtime,
	conversation: Pick<Conversation, "officeId" | "crm">,
	now = Date.now(),
): void {
	if (!conversation.crm || conversation.crm.leadUrl) return;
	const { officeId } = conversation;
	const last = accountLookups.get(officeId);
	if (last !== undefined && now - last < ACCOUNT_LOOKUP_EVERY_MS) return;
	accountLookups.set(officeId, now);
	// The label names the job only (#220); the failure's own line names the office.
	void runInBackground("crm account", () =>
		crmSyncFor(runtime)
			.resolveAccount(officeId)
			.catch((error: unknown) => {
				logAccountLookupFailure(officeId, error);
			}),
	);
}

/** The id a mock auto-reply reports, so a test can send its echo (ADR 0021, First greeting 7). */
export function autoReplyMockId(conversationId: string): string {
	return `mock-auto-reply-${conversationId}`;
}

/** Whether the office has spoken on the thread: any message of its own, or an Answer begun. */
function officeHasSpoken(conversation: Conversation): boolean {
	return (
		conversation.answers.length > 0 ||
		conversation.messages.some((message) => message.direction === "out")
	);
}

/**
 * When the auto-reply is filed: now, but never before the guest's message it greets. That
 * message carries the vendor's clock, which can run ahead of ours, and the thread is read in
 * time order.
 */
function afterGuestMessage(conversation: Conversation): Date {
	const latest = conversation.messages.findLast((message) => message.direction === "in");
	const after = latest ? Date.parse(latest.at) + 1 : 0;
	return new Date(Math.max(Date.now(), after));
}

/**
 * Whether the thread began before the auto-reply was last turned on (S1): such a thread is never
 * greeted, even if it was never claimed while the switch was off. A thread begins with its first
 * message, by the vendor's clock, so a thread begun within seconds of the switch can fall on
 * either side.
 */
function beganBefore(conversation: Conversation, onSince: string | null): boolean {
	if (!onSince) return false;
	const first = conversation.messages[0];
	return first !== undefined && Date.parse(first.at) < Date.parse(onSince);
}

/** What a failed auto-reply send is logged as: a category, never the thread or its text (PDPL). */
function sendFailureKind(error: unknown): string {
	if (error instanceof SendError) return error.kind;
	return "network";
}

/**
 * The auto-reply (ADR 0021): one greeting for a new guest's first message, sent without an
 * approval. The claim comes first and is never given back, so whatever happens after it the
 * thread is greeted at most once: a disconnected endpoint, a closed window or a failed send
 * leaves it ungreeted, and the thread waits for a human as it does today. One attempt, no
 * retry. It is not an Answer (G5): the thread stays Your turn and nothing in the funnel moves.
 * This is the template path; the model writes it from #168.
 */
export async function sendAutoReply(runtime: Runtime, conversation: Conversation): Promise<void> {
	const { store, config } = runtime;
	const shot = conversation.oneShot;
	if (!shot) return;
	const office = await store.officeAutoReply(conversation.officeId);
	if (!office?.on) return;
	if (beganBefore(conversation, office.onSince)) return;
	if (!(await store.claimAutoReply(conversation.officeId, conversation.id))) return;

	// From the endpoint the guest wrote to, as an Answer goes (ADR 0017): never from a
	// disconnected one, and in a live deployment never from one the office has not connected.
	const endpoint = latestGuestEndpoint(conversation);
	if (endpoint) {
		const connection = await connectionFor(conversation.pipe, endpoint, conversation.officeId, {
			config,
			store,
		});
		if (connection.state === "disconnected") return;
		if (config.sendMode === "live" && connection.state === "not_connected") return;
	} else if (config.sendMode === "live") {
		return;
	}
	if (!pipeAdapter(conversation.pipe).sendWindow(conversation).open) return;

	const text = greetingTemplate(shot.language, shot.qualification, office.name);
	let result: SendResult;
	try {
		result = await transmit({
			conversation,
			text,
			from: endpoint,
			config,
			store,
			mockVendorMessageId: autoReplyMockId(conversation.id),
		});
	} catch (error) {
		console.warn("inbox: auto-reply send failed", { kind: sendFailureKind(error) });
		return;
	}
	let greeted: Conversation | null;
	try {
		greeted = await store.recordAutoReply(conversation.officeId, conversation.id, {
			text,
			writtenBy: "template",
			result,
			pipeExternalId: endpoint,
			at: afterGuestMessage(conversation),
		});
	} catch {
		// Sent but not on file. Its echo, if the vendor sends one, then reads as a reply from
		// the office's app: the race Answers already have (ADR 0021, recorded, not fixed).
		console.warn("inbox: auto-reply record failed");
		return;
	}
	if (greeted) await redraftAfterGreeting(runtime, greeted);
}

/**
 * The greeting is on file, so the reply box takes the follow-up path (R11, P2): the guest's
 * message, still unanswered, gets the follow-up template now, then the model's follow-up,
 * written from the whole conversation with the greeting in it, where there is a model. It runs
 * on the thread as reloaded after the greeting's row, so a guest message that landed meanwhile
 * is the one drafted for.
 */
async function redraftAfterGreeting(runtime: Runtime, greeted: Conversation): Promise<void> {
	const updated = await applyOneShot(runtime.store, greeted);
	if (updated?.oneShot && updated.unansweredInboundId && runtime.drafts.provider !== "none") {
		await runInBackground("follow-up draft", async () => {
			await generateModelDraft(runtime, updated);
		});
	}
}

/**
 * Everything that follows a guest message: the one-shot now, then the alert (a new message
 * only), the auto-reply for a new guest's first message (ADR 0021), translation and, on a
 * thread the office has sent or greeted on, the model draft in the background. A thread with
 * no lead yet gets one in the office's CRM, in the background too (spec #59): the guest and the
 * queue never wait on the CRM. An ungreeted first message keeps the first-reply template until
 * the model draft is shown to be better on the invented threads (ADR 0005); a greeted one gets
 * the follow-up path once the greeting is on file (`redraftAfterGreeting`, ADR 0021 P2).
 */
export async function afterGuestInbound(
	runtime: Runtime,
	conversation: Conversation,
	{
		inserted,
		alerts,
		autoReply = true,
	}: { inserted: boolean; alerts?: AlertTransport; autoReply?: boolean },
): Promise<Conversation> {
	const updated = (await applyOneShot(runtime.store, conversation)) ?? conversation;
	// Only a new message alerts: a vendor's retry of one already stored alerts no one (ADR 0019).
	// After the one-shot, so the alert can name the guest's language.
	if (inserted) {
		scheduleGuestAlert(runtime, updated, alerts);
	}
	// A new message on a thread the office has not spoken on and nobody has claimed. The job's
	// claim is what makes it one greeting; this only spares a job for every later message.
	// Its label names no thread: a failed job's log keeps no guest data (PDPL).
	if (
		inserted &&
		autoReply &&
		updated.oneShot &&
		updated.autoReplyAt === null &&
		!officeHasSpoken(updated)
	) {
		void runInBackground("auto-reply", async () => {
			await sendAutoReply(runtime, updated);
		});
	}
	if (!updated.crm) {
		void runInBackground("crm lead", async () => {
			try {
				await crmSyncFor(runtime).newGuest(updated);
			} catch (error) {
				logCrmWriteFailure(error);
			}
		});
	}
	const inbound = updated.messages.find((message) => message.id === updated.unansweredInboundId);
	if (inbound) {
		scheduleTranslations(runtime, updated.officeId, inbound);
		if (takesFollowUpPath(updated) && updated.oneShot && runtime.drafts.provider !== "none") {
			void runInBackground("follow-up draft", async () => {
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
/** What became of a webhook's messages: where each was filed, and which found no office. */
export type IngestSummary = {
	filed: { endpoint: string; officeId: string; vendorMessageId: string | null }[];
	dropped: { endpoint: string | null; vendorMessageId: string | null }[];
};

export async function ingestEvents(
	runtime: Runtime,
	events: InboundEvent[],
): Promise<IngestSummary> {
	const summary: IngestSummary = { filed: [], dropped: [] };
	for (const event of events) {
		const endpoint = event.pipeExternalId ?? null;
		const officeId = endpoint ? await runtime.store.officeForPipe(event.pipe, endpoint) : null;
		if (!endpoint || !officeId) {
			console.warn("inbox: inbound dropped, no office owns this pipe", {
				pipe: event.pipe,
				pipeExternalId: endpoint,
			});
			summary.dropped.push({ endpoint, vendorMessageId: event.vendorMessageId });
			continue;
		}
		const { conversation, inserted } = await runtime.store.upsertInbound(event, officeId);
		summary.filed.push({ endpoint, officeId, vendorMessageId: event.vendorMessageId });
		if (event.source === "guest") {
			await afterGuestInbound(runtime, conversation, { inserted });
		}
	}
	return summary;
}

export async function injectDevInbound(
	input: {
		pipe: Pipe;
		guestId: string;
		text: string;
		officeId: string;
		guestName?: string | null;
		vendorMessageId?: string | null;
		at?: number | string | Date;
	},
	/**
	 * The seed passes the mock transport (a seed run never pushes, #134, Q3) and no auto-reply:
	 * the walk's demo threads keep the states they are written in (ADR 0021).
	 */
	{ alerts, autoReply = true }: { alerts?: AlertTransport; autoReply?: boolean } = {},
): Promise<Conversation> {
	const runtime = getRuntime();
	const { conversation, inserted } = await runtime.store.upsertInbound(
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
	return afterGuestInbound(runtime, conversation, { inserted, alerts, autoReply });
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
	viewer: InboxViewer,
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

	// The reply goes out from the office's endpoint the guest wrote to (ADR 0010, ADR 0017).
	// A disconnected one refuses in any deployment; in a live one, an endpoint that is not
	// connected refuses too, rather than recording a mock send the guest never receives.
	const endpoint = latestGuestEndpoint(conv);
	if (endpoint) {
		const connection = await connectionFor(conv.pipe, endpoint, conv.officeId, { config, store });
		if (connection.state === "disconnected") {
			return {
				ok: false,
				status: 409,
				error: "pipe_disconnected",
				message:
					"This connection is disconnected, so replies on it cannot be sent. Nhịp has been notified.",
			};
		}
		if (config.sendMode === "live" && connection.state === "not_connected") {
			return {
				ok: false,
				status: 409,
				error: "pipe_not_connected",
				message: "This thread arrived on a number or OA the office has not connected.",
			};
		}
	} else if (config.sendMode === "live") {
		return {
			ok: false,
			status: 409,
			error: "pipe_not_connected",
			message: "This thread has no number or OA to answer from.",
		};
	}

	// The Answer is written before the vendor call. Its unique inbound is the guard against
	// a concurrent approval; its status is what decides whether a retry is ever allowed.
	const begun = await store.beginAnswer({
		officeId: conv.officeId,
		conversationId: conv.id,
		inboundId,
		text,
		operatorId: viewer.userId,
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
			case "not_found":
				// The thread was deleted since it was read (ADR 0020).
				return { ok: false, status: 404, error: "not_found" };
		}
	}
	const answerId = begun.answer.id;

	let result: SendResult;
	try {
		result = await transmit({ conversation: conv, text, from: endpoint, config, store });
	} catch (err) {
		const message = err instanceof Error ? err.message : "send failed";
		if (err instanceof SendError) {
			// The vendor refused, or nothing was sent: a definite failure the operator may retry.
			await store.failAnswer(conv.officeId, answerId, message);
			return { ok: false, status: 502, error: "send_failed", message, detail: err.detail };
		}
		// A network failure or timeout: the vendor may or may not have the message. Never
		// retried automatically, and never approved again until a person has checked.
		await store.markAnswerUnknown(conv.officeId, answerId, message);
		return {
			ok: false,
			status: 502,
			error: "delivery_unknown",
			message: `${DELIVERY_UNKNOWN_MESSAGE} (${message})`,
		};
	}

	try {
		const updated = await store.completeAnswer(conv.officeId, answerId, result);
		if (!updated) {
			return { ok: false, status: 404, error: "not_found" };
		}
		return { ok: true, conversation: updated };
	} catch (err) {
		// The vendor accepted but the record failed. The Answer stays on file as unknown, so
		// the reply is not sent a second time; someone reconciles it against the vendor.
		const message = err instanceof Error ? err.message : "record failed";
		await store
			.markAnswerUnknown(conv.officeId, answerId, `recorded_failed: ${message}`)
			.catch(() => undefined);
		return {
			ok: false,
			status: 500,
			error: "record_failed",
			message: "The reply was sent but could not be recorded. It will not be sent again.",
		};
	}
}

/**
 * The operator asks for a new suggestion (ADR 0005). This is the one place an ungreeted first
 * reply goes to the model: the automatic path keeps the template for it, an explicit request
 * does not (a greeted one is drafted automatically, ADR 0021 P2). Without a model, or when the
 * model's draft fails the post-check, the template is put back so the box is never empty.
 */
export async function regenerateDraft(id: string, viewer: InboxViewer): Promise<InboxResult> {
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
	const reply = takesFollowUpPath(conv)
		? followUpTemplate(shot.language)
		: draftReply(shot.language, shot.qualification);
	const updated = await runtime.store.setDraft(conv.officeId, conv.id, {
		reply,
		answersMessageId: conv.unansweredInboundId,
		source: "template",
	});
	if (!updated) {
		return { ok: false, status: 404, error: "not_found" };
	}
	return { ok: true, conversation: updated };
}
