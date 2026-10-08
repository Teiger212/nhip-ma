import { extractFromInbound } from "./extract";
import { NEW_THREAD, replyTemplate, type TemplateThread } from "./reply-template";
import type { OneShot } from "./types";

/**
 * The deterministic pass on a new inbound (CONTEXT.md): language, extraction, paperwork
 * flag, and the template suggested reply (ADR 0024) for `thread` as it stands.
 * `answersMessageId` is the guest message the reply is for.
 */
export function oneShot(
	text: string,
	answersMessageId: string | null = null,
	thread: TemplateThread = NEW_THREAD,
): OneShot {
	const extracted = extractFromInbound(text);
	const reply = replyTemplate(extracted.language, extracted.qualification, thread);
	return { ...extracted, draft: { reply, answersMessageId, source: "template" } };
}
