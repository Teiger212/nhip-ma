import type { ConversationSummary } from "./types";

/** Filter the thread list by guest name or last inbound text. Not a new entity. */
export function matchesThreadSearch(
	conversation: Pick<ConversationSummary, "guestName" | "guestId" | "lastInboundText">,
	query: string,
): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return true;
	}
	const name = (conversation.guestName || conversation.guestId).toLowerCase();
	return name.includes(needle) || conversation.lastInboundText.toLowerCase().includes(needle);
}
