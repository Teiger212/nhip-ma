import type { Conversation } from "./types";

export function lastInboundText(conversation: Conversation): string {
	for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
		if (conversation.messages[i].source === "guest") {
			return conversation.messages[i].text;
		}
	}
	return "";
}

/** Filter the thread list by guest name or last inbound text. Not a new entity. */
export function matchesThreadSearch(conversation: Conversation, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return true;
	}
	const name = (conversation.guestName || conversation.guestId).toLowerCase();
	return name.includes(needle) || lastInboundText(conversation).toLowerCase().includes(needle);
}
