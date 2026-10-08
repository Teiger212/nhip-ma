import type { Conversation, GuestLanguage } from "./types";

export type CribTranslate = (key: string, values?: Record<string, string>) => string;

/**
 * The operator note: one line beside the reply box, in the operator's language, on how to answer
 * (#248): the language the reply is in, and not to interview the guest. The guest's facts and the
 * paperwork flag are in the guest details beside it, so the note never repeats them.
 */
export function formatConversationCrib(
	conversation: Pick<Conversation, "oneShot">,
	t: CribTranslate,
): string | null {
	if (!conversation.oneShot) {
		return null;
	}
	return formatCribNote({ language: conversation.oneShot.language }, t);
}

export function formatCribNote(input: { language: GuestLanguage }, t: CribTranslate): string {
	return t("crib.note", { language: t(`guestLanguage.${input.language}`) });
}
