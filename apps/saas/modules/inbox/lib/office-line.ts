import type {
	Draft,
	DraftSource,
	GuestLanguage,
	Message,
	OperatorLanguage,
	SuggestedReplyLine,
	Translations,
} from "./types";

/**
 * The operator line (#242, ADR 0007 as amended): what an outgoing text says in the office
 * language (ADR 0025), shown muted under the suggested reply, the auto-reply and a sent message,
 * so an agent never approves text they can't read. A template's line is the same template
 * rendered in the office language, with no model call, labelled with that language ("In
 * English"); a model draft's is the office-language text the model wrote with it (#251),
 * labelled "Translation". A reply the agent edited or typed gets none for now. No line when the
 * reply is already in the office language.
 */
export type OfficeLine = {
	text: string;
	/** "In ‹language›" for a template's render; "Translation" for the model's text. */
	label: "inLanguage" | "translation";
	/** The line's own language. */
	language: OperatorLanguage;
};

/** How a line is labelled, from who wrote the text it renders. */
function labelFor(writtenBy: DraftSource | null): OfficeLine["label"] {
	return writtenBy === "model" ? "translation" : "inLanguage";
}

/**
 * A template's text in the office language, beside the one in the reply's language: undefined
 * when the reply is already in it. `render` writes the template in a language.
 */
export function officeRender(
	replyLanguage: GuestLanguage,
	officeLanguage: OperatorLanguage,
	render: (language: GuestLanguage) => string,
): string | undefined {
	return replyLanguage === officeLanguage ? undefined : render(officeLanguage);
}

/**
 * The line under the reply box: the suggestion's office-language text while the box still holds
 * the suggestion. Once the agent types, it goes: it would describe text no longer in the box.
 */
export function suggestionLine(
	draft: Pick<Draft, "source" | "officeReply"> | undefined,
	edited: boolean,
	officeLanguage: OperatorLanguage | undefined,
): OfficeLine | null {
	if (edited || !draft?.officeReply || !officeLanguage) return null;
	return { text: draft.officeReply, label: labelFor(draft.source), language: officeLanguage };
}

/**
 * What a sent reply stores of its suggestion (#242): only a reply sent as suggested, for the guest
 * message it was written for, carries who wrote it and its line; an edited or typed one carries
 * neither (null). A template's line is rendered again now, in the office language as it is at
 * send time, when the template rendered now is still the sent text; otherwise the suggestion's
 * stored line is kept. A model draft's is the office-language text stored with it.
 */
export function sentLine({
	draft,
	inboundId,
	text,
	replyLanguage,
	officeLanguage,
	render,
}: {
	draft: Draft | undefined;
	inboundId: string;
	/** The text sent, trimmed. */
	text: string;
	replyLanguage: GuestLanguage;
	officeLanguage: OperatorLanguage;
	/** The template for the thread as it stands now, in a language. */
	render: (language: GuestLanguage) => string;
}): SuggestedReplyLine | null {
	if (!draft || draft.answersMessageId !== inboundId || draft.reply.trim() !== text) return null;
	const writtenBy = draft.source;
	if (replyLanguage === officeLanguage) return { writtenBy, officeText: null };
	const officeText =
		writtenBy === "template" && render(replyLanguage).trim() === text
			? render(officeLanguage)
			: draft.officeReply;
	return {
		writtenBy,
		officeText: officeText ? { locale: officeLanguage, text: officeText } : null,
	};
}

const OTHER: Record<OperatorLanguage, OperatorLanguage> = { en: "vi", vi: "en" };

/**
 * An office message's line in the thread: its office-language text, or, after the manager
 * changed the office language, the one stored in the language it had then, labelled with that
 * language. None on a guest message (translations are theirs), and none when the thread's reply
 * language is the office language.
 */
export function messageLine(
	message: Pick<Message, "direction" | "writtenBy"> & { translations?: Translations },
	officeLanguage: OperatorLanguage | undefined,
	replyLanguage: GuestLanguage | null,
): OfficeLine | null {
	if (message.direction !== "out" || !officeLanguage || replyLanguage === officeLanguage) {
		return null;
	}
	const label = labelFor(message.writtenBy);
	for (const language of [officeLanguage, OTHER[officeLanguage]]) {
		const text = message.translations?.[language];
		if (text) return { text, label, language };
	}
	return null;
}
