import { namedLanguage } from "./language-name";
import type { Conversation, ConversationSummary } from "./types";

/** The text of the guest's latest message, or "" when the guest has not written. */
function latestGuestText(conversation: Pick<Conversation, "messages">): string {
	for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
		if (conversation.messages[i].direction === "in") {
			return conversation.messages[i].text;
		}
	}
	return "";
}

/**
 * A whole thread as the list sees it. The store builds summaries in SQL for the list; this
 * is the same projection from a thread already loaded, so a thread the operator just acted
 * on updates the list at once instead of on the next poll.
 */
export function summarize(conversation: Conversation): ConversationSummary {
	return {
		id: conversation.id,
		pipe: conversation.pipe,
		guestId: conversation.guestId,
		guestName: conversation.guestName,
		officeId: conversation.officeId,
		owner: conversation.owner,
		lastGuestInboundAt: conversation.lastGuestInboundAt,
		sentAt: conversation.sentAt,
		unansweredInboundId: conversation.unansweredInboundId,
		updatedAt: conversation.updatedAt,
		guestLanguage: conversation.oneShot ? namedLanguage(conversation.oneShot) : null,
		lastInboundText: latestGuestText(conversation),
		crm: conversation.crm,
	};
}
