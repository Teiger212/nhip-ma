import { RIVER_OFFICE_ID } from "../demo-user";
import { DRAFT_MESSAGES, type DraftInput } from "../drafts";
import { threadTexts } from "../drafts/guardrails";
import { extractFromInbound } from "../extract";
import { autoReplyOpenQuestions } from "../model-draft";
import type { Message } from "../types";
import { RIVER_SEED_OFFICE } from "./river-office";

/** The river office keeps the default office language (English): its operator line is English. */
const OFFICE_LANGUAGE = "en" as const;

export type DraftRequest = { fixture: string; guest: string; input: DraftInput; written: string[] };

function message(id: string, direction: Message["direction"], text: string, at: number): Message {
	return {
		id,
		direction,
		source: direction === "in" ? "guest" : "nhip",
		text,
		at: new Date(at).toISOString(),
		vendorMessageId: null,
		pipeExternalId: null,
		writtenBy: null,
		translations: {},
	};
}

/**
 * Each model draft's request: the river story played as messages up to the step, as the app reads
 * the thread when the draft is asked for. A sent model draft joins the thread as the reply it
 * became, so a later request reads it; `sentReplies` holds the ones generated this run.
 */
export function riverDraftRequests(now: number, sentReplies: Map<string, string>): DraftRequest[] {
	const out: DraftRequest[] = [];
	for (const guest of RIVER_SEED_OFFICE.guests) {
		const messages: Message[] = [];
		for (const step of guest.story) {
			const at = now - step.ago;
			const id = `${guest.guestId}-${messages.length}`;
			if (step.kind === "writes") messages.push(message(id, "in", step.text, at));
			else if (step.kind === "replies") messages.push(message(id, "out", step.text, at));
			else if (step.kind === "ai-replies" || step.kind === "ai-draft") {
				if (messages.at(-1)?.direction !== "in") {
					throw new Error(
						`generate-demo-drafts: ${guest.name}'s draft ${step.fixture} follows no guest message`,
					);
				}
				// The one-shot reads every guest message of the thread (`guestInboundText`).
				const guestText = messages
					.filter((each) => each.direction === "in")
					.map((each) => each.text)
					.join("\n");
				const shot = extractFromInbound(guestText);
				out.push({
					fixture: step.fixture,
					guest: guest.name ?? guest.guestId,
					written: threadTexts(messages),
					input: {
						officeId: RIVER_OFFICE_ID,
						guestName: guest.name,
						guestLanguage: shot.language,
						officeLanguage: OFFICE_LANGUAGE,
						openQuestions: autoReplyOpenQuestions(messages, shot.language, shot.qualification),
						messages: messages.slice(-DRAFT_MESSAGES),
						qualification: shot.qualification,
						paperwork: shot.paperwork,
					},
				});
				if (step.kind === "ai-replies") {
					const sent = sentReplies.get(step.fixture);
					messages.push(message(id, "out", sent ?? `(model draft ${step.fixture})`, at));
				}
			}
		}
	}
	return out;
}
