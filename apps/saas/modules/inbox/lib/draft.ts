import { extractFromInbound } from "./extract";
import { owesEnglishReplyLine } from "./greeting";
import { DEFAULT_SUPPORTED_GUEST_LANGUAGES } from "./language-name";
import { NEW_THREAD, replyTemplate, type TemplateThread, templateTexts } from "./reply-template";
import type { GuestLanguage, OneShot, OperatorLanguage } from "./types";

/**
 * The deterministic pass on a new inbound (CONTEXT.md): language, extraction, paperwork
 * flag, and the template suggested reply (ADR 0024) for `thread` as it stands.
 * `answersMessageId` is the guest message the reply is for. Given the office language, the
 * reply carries its operator line too (#242). `supported` is the deployment's gate
 * (`SUPPORTED_GUEST_LANGUAGES`, #306): the languages Nhịp replies in.
 */
export function oneShot(
	text: string,
	answersMessageId: string | null = null,
	thread: TemplateThread = NEW_THREAD,
	officeLanguage?: OperatorLanguage,
	supported: readonly GuestLanguage[] = DEFAULT_SUPPORTED_GUEST_LANGUAGES,
): OneShot {
	const extracted = extractFromInbound(text, supported);
	const englishLine = owesEnglishReplyLine(extracted, thread.messages);
	const texts = officeLanguage
		? templateTexts(
				extracted.language,
				officeLanguage,
				extracted.qualification,
				thread,
				englishLine,
			)
		: { reply: replyTemplate(extracted.language, extracted.qualification, thread, englishLine) };
	return { ...extracted, draft: { ...texts, answersMessageId, source: "template" } };
}
