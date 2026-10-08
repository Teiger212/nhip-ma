import type { ModelTask } from "../config";
import type { GuestLanguage, Message, OperatorLanguage, Paperwork, Qualification } from "../types";

export type { ModelTask } from "../config";

/**
 * The model layer (ADR 0005, ADR 0007, ADR 0024): one seam every model call goes through, as a
 * named task, `draft` or `translate`, like pipes and the CRM. A `null` result always means "the
 * fallback stands": no translation is shown, or the template stays in the reply box.
 */
export type TranslateInput = {
	/** The office whose daily cap the call counts against (ADR 0024). */
	officeId: string;
	text: string;
	from: GuestLanguage;
	to: OperatorLanguage;
};

export type DraftInput = {
	/** The office whose daily cap the call counts against (ADR 0024). */
	officeId: string;
	guestName: string | null;
	guestLanguage: GuestLanguage;
	/** The whole conversation, oldest first. Office messages are the agent's own words. */
	messages: Array<Pick<Message, "direction" | "source" | "text" | "at">>;
	qualification: Qualification;
	paperwork: Paperwork;
};

export type DraftAdapter = {
	/** Whether the task has a model (or, in E2E, the stub) behind it. One that hasn't returns null. */
	serves(task: ModelTask): boolean;
	translate(input: TranslateInput): Promise<string | null>;
	draft(input: DraftInput): Promise<string | null>;
};

/** The fallback adapter: no model, no translation, template drafts. */
export const noDraftAdapter: DraftAdapter = {
	serves: () => false,
	translate: async () => null,
	draft: async () => null,
};
