import type { Conversation } from "./types";

/** What the operator sees a guest called: their name when the pipe gave one, else the id. */
export function displayName(conversation: Conversation): string {
	return conversation.guestName || conversation.guestId;
}
