import { isSupportedLanguage, languageName, namedLanguage } from "./language-name";
import type { Conversation, GuestLanguage } from "./types";

export type CribTranslate = (key: string, values?: Record<string, string>) => string;

/**
 * The operator note: one line beside the reply box, in the operator's language, on how to answer
 * (#248): the language the reply is in, and not to interview the guest. The guest's facts and the
 * paperwork flag are in the guest details beside it, so the note never repeats them. For a guest
 * language Nhịp doesn't support, it says the reply is in English and names that language (#245).
 */
export function formatConversationCrib(
	conversation: Pick<Conversation, "oneShot">,
	t: CribTranslate,
	locale = "en",
): string | null {
	if (!conversation.oneShot) {
		return null;
	}
	return formatCribNote(
		{
			language: conversation.oneShot.language,
			guestLanguage: namedLanguage(conversation.oneShot),
		},
		t,
		locale,
	);
}

export function formatCribNote(
	input: {
		language: GuestLanguage;
		/** The guest language, named (#245); `language` when absent. */
		guestLanguage?: string;
	},
	t: CribTranslate,
	locale = "en",
): string {
	const guestLanguage = input.guestLanguage ?? input.language;
	if (!isSupportedLanguage(guestLanguage)) {
		return t("crib.noteUnsupported", {
			language: languageName(guestLanguage, locale, (language) => t(`guestLanguage.${language}`)),
		});
	}
	return t("crib.note", { language: t(`guestLanguage.${input.language}`) });
}
