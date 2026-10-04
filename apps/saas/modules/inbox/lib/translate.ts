import { runInBackground } from "./background";
import { detectLanguage } from "./language";
import type { Runtime } from "./runtime";
import {
	type Conversation,
	type Message,
	OperatorLanguage,
	type TranslationFailure,
} from "./types";

/**
 * Guest message translation (ADR 0007). Runs once per message per operator language,
 * through the draft adapter, in the background; the UI shows the original at once and
 * the translation when it lands. A message already in the operator's language is not
 * translated, and nothing runs at all without a model behind the adapter.
 */
const inFlight = new Map<string, Promise<void>>();

function key(messageId: string, locale: OperatorLanguage): string {
	return `${messageId}:${locale}`;
}

/** After a failed translation, the model is not asked again for this long (ADR 0007). */
export const TRANSLATION_RETRY_AFTER_MS = 10 * 60 * 1000;

/** After this many failures in a row the model is not asked again; the original stands. */
export const TRANSLATION_MAX_ATTEMPTS = 5;

/**
 * Whether a translation that failed before may be tried again at `now`. A failed model call
 * stores nothing, so without this every read of the thread would call the paid model again.
 * The failures are kept in the database, so every instance waits out the same backoff.
 */
export function translationRetryDue(
	failure: Pick<TranslationFailure, "attempts" | "lastFailedAt"> | undefined,
	now: number,
): boolean {
	if (!failure) return true;
	if (failure.attempts >= TRANSLATION_MAX_ATTEMPTS) return false;
	return now - new Date(failure.lastFailedAt).getTime() >= TRANSLATION_RETRY_AFTER_MS;
}

export function needsTranslation(message: Message, locale: OperatorLanguage): boolean {
	return (
		message.direction === "in" &&
		!message.translations[locale] &&
		detectLanguage(message.text) !== locale
	);
}

export function scheduleTranslation(
	runtime: Runtime,
	officeId: string,
	message: Message,
	locale: OperatorLanguage,
): Promise<void> | null {
	if (runtime.drafts.provider === "none" || !needsTranslation(message, locale)) {
		return null;
	}
	const id = key(message.id, locale);
	const existing = inFlight.get(id);
	if (existing) {
		return existing;
	}
	const job = runInBackground(`translate ${id}`, async () => {
		let text: string | null;
		try {
			text = await runtime.drafts.translate({
				text: message.text,
				from: detectLanguage(message.text),
				to: locale,
			});
		} catch (error) {
			await runtime.store.recordTranslationFailure(officeId, message.id, locale, new Date());
			throw error;
		}
		if (text) {
			await runtime.store.setTranslation(officeId, message.id, locale, text);
		} else {
			await runtime.store.recordTranslationFailure(officeId, message.id, locale, new Date());
		}
	}).finally(() => {
		inFlight.delete(id);
	});
	inFlight.set(id, job);
	return job;
}

/** At ingest: the new guest message, into every operator language it is not already in. */
export function scheduleTranslations(runtime: Runtime, officeId: string, message: Message): void {
	for (const locale of OperatorLanguage.options) {
		void scheduleTranslation(runtime, officeId, message, locale);
	}
}

/**
 * On opening a thread: whatever the operator's locale is missing. This is how messages
 * written before translation existed, or before this locale was used, get theirs, and how a
 * failed translation is retried once its backoff has passed. Nothing is read from the
 * database unless a message is actually missing its translation.
 */
export function scheduleMissingTranslations(
	runtime: Runtime,
	conversation: Pick<Conversation, "id" | "officeId" | "messages">,
	locale: OperatorLanguage,
): void {
	if (runtime.drafts.provider === "none") {
		return;
	}
	const missing = conversation.messages.filter(
		(message) => needsTranslation(message, locale) && !inFlight.has(key(message.id, locale)),
	);
	if (missing.length === 0) {
		return;
	}
	void runInBackground(`translations ${conversation.id} ${locale}`, async () => {
		const failures = await runtime.store.translationFailures(
			conversation.officeId,
			missing.map((message) => message.id),
			locale,
		);
		const byMessage = new Map(failures.map((failure) => [failure.messageId, failure]));
		const now = Date.now();
		for (const message of missing) {
			if (translationRetryDue(byMessage.get(message.id), now)) {
				void scheduleTranslation(runtime, conversation.officeId, message, locale);
			}
		}
	});
}
