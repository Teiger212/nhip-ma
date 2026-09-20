import type { Conversation } from "./types";

/**
 * What the send bar says about the selected thread, decided here so the bar only renders.
 * Ordered by urgency: a send in flight, then an error from the last attempt, then an
 * Answer of unknown outcome (a person must check the vendor, ADR 0011), then the last
 * successful send, else nothing has been sent for the open message.
 */
export type SendStatus =
	| { kind: "sending" }
	| { kind: "error"; message: string }
	| { kind: "unknown" }
	| { kind: "sent"; at: string }
	| { kind: "none" };

export function sendStatusFor({
	sending,
	error,
	conversation,
}: {
	sending: boolean;
	error: string | null;
	conversation: Conversation | null;
}): SendStatus {
	if (sending) return { kind: "sending" };
	if (error) return { kind: "error", message: error };
	if (conversation?.lastAnswer?.status === "unknown") return { kind: "unknown" };
	if (conversation && !conversation.unansweredInboundId && conversation.sentAt) {
		return { kind: "sent", at: conversation.sentAt };
	}
	return { kind: "none" };
}
