import { runInBackground } from "./background";
import { CAPPED, DRAFT_MESSAGES } from "./drafts";
import { checkFollowUp, parseModelDraft, threadTexts } from "./drafts/guardrails";
import { askedIn, greetingQuestion, missingQualifiers } from "./greeting";
import { officeHasHumanReply } from "./reply-template";
import type { Runtime } from "./runtime";
import type { Conversation, GuestLanguage, Qualification } from "./types";

/**
 * How long a guest message waits before the model drafts its reply (ADR 0024): guests send
 * bursts, so each message restarts the wait and a burst gets one draft, for its last message.
 */
export const DRAFT_DEBOUNCE_MS = 30_000;

/**
 * Whether the model writes the suggested reply for the thread as it is (ADR 0024): only after
 * the office's first human reply (a sent Answer, or a reply from the office's own app; the
 * auto-reply is not one), and only while a guest message waits for an answer. Before that the
 * reply box holds the template: ADR 0005's "first reply keeps the template".
 */
export function modelDrafts(conversation: Conversation): boolean {
	return (
		Boolean(conversation.unansweredInboundId && conversation.oneShot) &&
		officeHasHumanReply(conversation)
	);
}

/**
 * The auto-reply's questions the guest hasn't answered yet (ADR 0024): what it asked, as it
 * was sent, less the details the guest has given since. Worded in the reply's language.
 */
export function autoReplyOpenQuestions(
	messages: Conversation["messages"],
	language: GuestLanguage,
	qualification: Qualification,
): string[] {
	const asked = new Set(
		messages
			.filter((message) => message.source === "auto-reply")
			.flatMap((message) => askedIn(message.text)),
	);
	return missingQualifiers(qualification)
		.filter((qualifier) => asked.has(qualifier))
		.map((qualifier) => greetingQuestion(language, qualifier));
}

/**
 * Ask the model for a follow-up (ADR 0024, #251) and store it as the suggested reply, unless
 * the guest message was answered in the meantime (a stale draft must never overwrite the next
 * inbound's). The model reads the last 10 messages and the auto-reply's open questions, and
 * answers JSON with the reply and the same reply in the office language. Both texts pass the
 * post-check against the guest's own messages, or the template stands: so does a malformed
 * answer. Returns null when the template stands. The stored suggestion is the server's only:
 * what the agent typed lives in their browser and is never overwritten (`use-reply-draft.ts`).
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
	const officeLanguage = await runtime.store.officeLanguage(conversation.officeId);
	const raw = await runtime.drafts.draft({
		officeId: conversation.officeId,
		guestName: conversation.guestName,
		guestLanguage: shot.language,
		officeLanguage,
		openQuestions: autoReplyOpenQuestions(conversation.messages, shot.language, shot.qualification),
		messages: conversation.messages.slice(-DRAFT_MESSAGES),
		qualification: shot.qualification,
		paperwork: shot.paperwork,
	});
	// Past the office's daily cap the template stands; a draft keeps no attempts to spare.
	const drafted = parseModelDraft(raw === CAPPED ? null : raw);
	const written = threadTexts(conversation.messages);
	const reply = checkFollowUp(drafted?.reply, written);
	const officeReply = checkFollowUp(drafted?.officeReply, written);
	if (!reply || !officeReply) {
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
		// A reply already in the office language needs no second text, as a guest message in it
		// gets no translation (ADR 0025).
		...(shot.language === officeLanguage ? {} : { officeReply }),
	});
}

/**
 * The guest messages this instance has asked the model about. A thread is read again on every
 * poll while it is open, and opening drafts at once: without this, a draft the post-check
 * blocked, or one past the cap, would be asked for again on every poll. Per instance: another
 * instance may ask once more for the same message (recorded, not fixed). Cleared when it grows
 * large, which at worst asks once more for a message still waiting.
 */
const asked = new Set<string>();
const ASKED_LIMIT = 10_000;

function markAsked(inboundId: string): void {
	if (asked.size >= ASKED_LIMIT) asked.clear();
	asked.add(inboundId);
}

/**
 * The guest message the model should draft for now, or null: the thread takes the model's path,
 * the model serves drafts, that message's one-shot is on file, no model draft for it is stored,
 * and this instance hasn't asked for one. A thread read between a new message's row and its
 * one-shot isn't drafted from: the one-shot writes the template for that message when it lands,
 * which would replace a model draft stored first. The next read drafts it.
 */
function waitingForDraft(runtime: Runtime, conversation: Conversation): string | null {
	const inboundId = conversation.unansweredInboundId;
	if (!inboundId || !modelDrafts(conversation) || !runtime.drafts.serves("draft")) return null;
	const draft = conversation.oneShot?.draft;
	if (draft?.answersMessageId !== inboundId || draft.source === "model") return null;
	return asked.has(inboundId) ? null : inboundId;
}

/** Ask the model once for the thread's waiting guest message, if it still waits for a draft. */
async function draftOnce(runtime: Runtime, conversation: Conversation): Promise<void> {
	const inboundId = waitingForDraft(runtime, conversation);
	if (!inboundId) return;
	markAsked(inboundId);
	await generateModelDraft(runtime, conversation);
}

/**
 * Regenerate (ADR 0005): the agent asks, so the model is asked whatever was asked before, and
 * neither the wait nor opening the thread asks again for the same message.
 */
export async function draftNow(
	runtime: Runtime,
	conversation: Conversation,
): Promise<Conversation | null> {
	if (conversation.unansweredInboundId) markAsked(conversation.unansweredInboundId);
	return generateModelDraft(runtime, conversation);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * A guest message landed (ADR 0024): draft its reply once the guest has been quiet for
 * `DRAFT_DEBOUNCE_MS`. The wait runs inside the background job, which `after()` keeps alive
 * (`background.ts`): it sleeps, reads the thread again, and drafts only if this message is
 * still the one waiting. A newer message started its own wait, which is how a burst restarts
 * it and gets one draft, written from the thread with the whole burst in it. Opening the thread
 * drafts at once (`draftOnOpen`), and the wait then finds the draft stored and asks nothing.
 */
export function scheduleModelDraft(runtime: Runtime, conversation: Conversation): void {
	const inboundId = waitingForDraft(runtime, conversation);
	if (!inboundId) return;
	const { officeId, id } = conversation;
	void runInBackground("follow-up draft", async () => {
		await wait(runtime.draftDebounceMs ?? DRAFT_DEBOUNCE_MS);
		const current = await runtime.store.getOfficeConversation(officeId, id);
		if (!current || current.unansweredInboundId !== inboundId) return;
		await draftOnce(runtime, current);
	});
}

/**
 * The agent opened the thread (ADR 0024): a guest message still waiting for its draft is
 * drafted now, in the background, rather than when its wait is over. The draft shows on the
 * next read. Every read of the open thread counts, as the Inbox polls it: once drafted, or once
 * asked, a read asks nothing.
 */
export function draftOnOpen(runtime: Runtime, conversation: Conversation): void {
	if (!waitingForDraft(runtime, conversation)) return;
	void runInBackground("follow-up draft", () => draftOnce(runtime, conversation));
}
