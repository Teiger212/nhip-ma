import type { OperatorLanguage } from "../types";
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
 * stands: a stated legal answer and a stated price (#251). One E2E build reaches both "· AI" and
 * the template this way.
 */
export const STUB_BLOCKED_DRAFT = "Yes, the pink book is ready and the rent is $2,000 a month.";
const ASKS_ABOUT_PINK_BOOK = /pink\s*book|s[ổo]\s*h[ồo]ng/iu;

/** Each reply as the office reads it (ADR 0025): the stub's second text, in the office language. */
const IN_OFFICE_LANGUAGE: Record<OperatorLanguage, { draft: string; blocked: string }> = {
	en: { draft: STUB_DRAFT, blocked: STUB_BLOCKED_DRAFT },
	vi: {
		draft: "Cảm ơn anh/chị đã nhắn tin. Em sẽ kiểm tra và phản hồi anh/chị ngay tại đây ạ.",
		blocked: "Dạ, sổ hồng đã có và giá thuê là 2.000 đô một tháng ạ.",
	},
};

/** The stub's answer in the model's JSON (#251): the reply, and the same in the office language. */
export function stubDraft(input: Pick<DraftInput, "messages" | "officeLanguage">): string {
	const lastGuest = input.messages.filter((message) => message.direction === "in").at(-1);
	const blocked = lastGuest ? ASKS_ABOUT_PINK_BOOK.test(lastGuest.text.normalize("NFC")) : false;
	const office = IN_OFFICE_LANGUAGE[input.officeLanguage];
	return JSON.stringify(
		blocked
			? { reply: STUB_BLOCKED_DRAFT, office_reply: office.blocked }
			: { reply: STUB_DRAFT, office_reply: office.draft },
	);
}

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
		run: async (input) => ({
			outcome: "ok",
			text: stubDraft(input),
			inputTokens: 0,
			outputTokens: 0,
		}),
	},
};
