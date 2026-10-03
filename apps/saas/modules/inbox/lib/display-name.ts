import type { ConversationSummary } from "./types";

/** What the operator sees a guest called: their name when the pipe gave one, else the id. */
export function displayName(
	conversation: Pick<ConversationSummary, "guestName" | "guestId">,
): string {
	return conversation.guestName || conversation.guestId;
}
