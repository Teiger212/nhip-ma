import { runInBackground } from "./background";
import { detectLanguage } from "./language";
import type { Runtime } from "./runtime";
import { type Conversation, type Message, OperatorLanguage } from "./types";

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

export function needsTranslation(message: Message, locale: OperatorLanguage): boolean {
	return (
		message.direction === "in" &&
		!message.translations[locale] &&
		detectLanguage(message.text) !== locale
	);
}

export function scheduleTranslation(
	runtime: Runtime,
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
		const text = await runtime.drafts.translate({
			text: message.text,
			from: detectLanguage(message.text),
			to: locale,
		});
		if (text) {
			await runtime.store.setTranslation(message.id, locale, text);
		}
	}).finally(() => {
		inFlight.delete(id);
	});
	inFlight.set(id, job);
	return job;
}

/** At ingest: the new guest message, into every operator language it is not already in. */
export function scheduleTranslations(runtime: Runtime, message: Message): void {
	for (const locale of OperatorLanguage.options) {
		void scheduleTranslation(runtime, message, locale);
	}
}

/**
 * On read: whatever an operator's locale is missing. This is how messages written before
 * translation existed, or before this locale was used, get theirs on first request.
 */
export function scheduleMissingTranslations(
	runtime: Runtime,
	conversations: Conversation[],
	locale: OperatorLanguage,
): void {
	if (runtime.drafts.provider === "none") {
		return;
	}
	for (const conversation of conversations) {
		for (const message of conversation.messages) {
			void scheduleTranslation(runtime, message, locale);
		}
	}
}
