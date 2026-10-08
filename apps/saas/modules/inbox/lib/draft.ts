import { extractFromInbound } from "./extract";
import { NEW_THREAD, replyTemplate, type TemplateThread, templateTexts } from "./reply-template";
import type { OneShot, OperatorLanguage } from "./types";

/**
 * The deterministic pass on a new inbound (CONTEXT.md): language, extraction, paperwork
 * flag, and the template suggested reply (ADR 0024) for `thread` as it stands.
 * `answersMessageId` is the guest message the reply is for. Given the office language, the
 * reply carries its operator line too (#242).
 */
export function oneShot(
	text: string,
	answersMessageId: string | null = null,
	thread: TemplateThread = NEW_THREAD,
	officeLanguage?: OperatorLanguage,
): OneShot {
	const extracted = extractFromInbound(text);
	const texts = officeLanguage
		? templateTexts(extracted.language, officeLanguage, extracted.qualification, thread)
		: { reply: replyTemplate(extracted.language, extracted.qualification, thread) };
	return { ...extracted, draft: { ...texts, answersMessageId, source: "template" } };
}
