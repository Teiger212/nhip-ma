import { matchesThreadSearch } from "./search";
import type { Conversation } from "./types";

/**
 * The inbox is a queue. These are the rules that define it: which threads still
 * need a first reply, how each view is ordered, and where the selection goes after a
 * send. The client module renders a QueueView; it does not restate any of this.
 */
export const INBOX_VIEWS = ["needsReply", "sent", "all"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export function isInboxView(value: unknown): value is InboxView {
	return typeof value === "string" && (INBOX_VIEWS as readonly string[]).includes(value);
}

export function needsReply(conversation: Pick<Conversation, "sentAt">): boolean {
	return !conversation.sentAt;
}

export function inView(conversation: Pick<Conversation, "sentAt">, view: InboxView): boolean {
	if (view === "all") return true;
	return view === "sent" ? !needsReply(conversation) : needsReply(conversation);
}

function time(value: string | null): number {
	return value ? new Date(value).getTime() : 0;
}

/** Oldest waiting guest first in the queue; most recent activity first elsewhere. */
export function compareForView(view: InboxView): (a: Conversation, b: Conversation) => number {
	return view === "needsReply"
		? (a, b) => time(a.lastGuestInboundAt) - time(b.lastGuestInboundAt)
		: (a, b) => time(b.updatedAt) - time(a.updatedAt);
}

export type QueueCounts = Record<InboxView, number>;

export type QueueView = {
	/** Threads in the current view that match the search, in view order. */
	visible: Conversation[];
	/** Per-view totals for the same search, so tab counts agree with the list. */
	counts: QueueCounts;
	/** Whether the queue is empty because the operator has replied to everyone. */
	caughtUp: boolean;
};

export function buildQueueView(
	conversations: Conversation[],
	view: InboxView,
	query: string,
): QueueView {
	const matching = conversations.filter((conversation) => matchesThreadSearch(conversation, query));
	const counts: QueueCounts = { needsReply: 0, sent: 0, all: matching.length };
	for (const conversation of matching) {
		if (needsReply(conversation)) counts.needsReply += 1;
		else counts.sent += 1;
	}
	const visible = matching
		.filter((conversation) => inView(conversation, view))
		.sort(compareForView(view));
	return {
		visible,
		counts,
		caughtUp:
			view === "needsReply" && !query.trim() && conversations.length > 0 && visible.length === 0,
	};
}

/**
 * Which thread should be selected after `visible` changed. Keeps the current
 * selection when it is still visible; otherwise the first visible thread; otherwise
 * nothing. After a send in the queue view the sent thread has left `visible`, so this
 * is also what advances to the next waiting guest.
 */
export function nextSelection(visible: Conversation[], selectedId: string | null): string | null {
	if (selectedId && visible.some((conversation) => conversation.id === selectedId)) {
		return selectedId;
	}
	return visible[0]?.id ?? null;
}
