import type { GuestLanguage, Message, OperatorLanguage, Paperwork, Qualification } from "../types";

/**
 * The draft adapter (ADR 0005, ADR 0007): one interface, one implementation per model
 * provider, and the template drafter as the fallback. Everything that talks to a model
 * sits behind this seam, like pipes and the CRM. A `null` result always means "the
 * fallback stands": no translation is shown, or the template stays in the reply box.
 */
export type TranslateInput = {
	text: string;
	from: GuestLanguage;
	to: OperatorLanguage;
};

export type FollowUpInput = {
	guestName: string | null;
	guestLanguage: GuestLanguage;
	/** The whole conversation, oldest first. Office messages are the agent's own words. */
	messages: Array<Pick<Message, "direction" | "source" | "text" | "at">>;
	qualification: Qualification;
	paperwork: Paperwork;
};

/** `openai-compatible` is any endpoint speaking the chat-completions protocol (OpenRouter by default). */
export type DraftProvider = "none" | "openai-compatible";

export type DraftAdapter = {
	/** `none` never calls anything: every method returns null and the fallback stands. */
	provider: DraftProvider;
	translate(input: TranslateInput): Promise<string | null>;
	followUp(input: FollowUpInput): Promise<string | null>;
};

/** The fallback adapter: no model, no translation, template drafts. */
export const noDraftAdapter: DraftAdapter = {
	provider: "none",
	translate: async () => null,
	followUp: async () => null,
};
