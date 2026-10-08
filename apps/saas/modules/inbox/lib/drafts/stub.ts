import type { DraftInput, TranslateInput } from "./adapter";
import type { TaskBackend } from "./layer";
import { languageName } from "./prompts";

/**
 * The deterministic stub model for E2E (ADR 0024), behind the same layer as OpenRouter: the
 * daily cap, the timeout and the log line all apply. It answers with fixed text, so a spec can
 * assert what it reads. `MODEL_STUB` turns it on per task; production refuses it (`config.ts`).
 */
export const STUB_MODEL = "stub";

/**
 * A translation names its two languages and never repeats the guest's words, so a spec that
 * finds a message by its text finds the message, not its translation too.
 */
export function stubTranslation(input: Pick<TranslateInput, "from" | "to">): string {
	return `Stub translation, ${languageName(input.from)} to ${languageName(input.to)}.`;
}

/** The stub's suggested reply: fixed, and one the post-check lets through. */
export const STUB_DRAFT = "Thanks for your message. I'll look into it and come back to you here.";

/**
 * A guest who asks about the pink book gets an answer the post-check blocks, so the template
 * stands: today for the paperwork word, and once the post-check blocks answers (#251) for the
 * stated price and legal answer. One E2E build reaches both "· AI" and the template this way.
 */
export const STUB_BLOCKED_DRAFT = "Yes, the pink book is ready and the rent is $2,000 a month.";
const ASKS_ABOUT_PINK_BOOK = /pink\s*book|s[ổo]\s*h[ồo]ng/iu;

export const stubBackends: {
	draft: TaskBackend<DraftInput>;
	translate: TaskBackend<TranslateInput>;
} = {
	translate: {
		model: STUB_MODEL,
		run: async (input) => ({
			outcome: "ok",
			text: stubTranslation(input),
			inputTokens: 0,
			outputTokens: 0,
		}),
	},
	draft: {
		model: STUB_MODEL,
		run: async (input) => {
			const lastGuest = input.messages.filter((message) => message.direction === "in").at(-1);
			const blocked = lastGuest
				? ASKS_ABOUT_PINK_BOOK.test(lastGuest.text.normalize("NFC"))
				: false;
			return {
				outcome: "ok",
				text: blocked ? STUB_BLOCKED_DRAFT : STUB_DRAFT,
				inputTokens: 0,
				outputTokens: 0,
			};
		},
	},
};
