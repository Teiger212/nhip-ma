import { matchesThreadSearch } from "./search";
import type { Conversation } from "./types";

/**
 * The inbox is a queue. These are the rules that define it (ADR 0004): "Your turn" is the
 * only pending state, the quiet section holds the Your-turn threads the guest has not
 * touched for a while, and each view has one order. The client module renders a
 * QueueView; it does not restate any of this.
 */
export const INBOX_VIEWS = ["yourTurn", "sent", "all"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

/** A product constant, not a setting, until someone asks (ADR 0004). */
export const QUIET_AFTER_MS = 48 * 60 * 60 * 1000;

export function isInboxView(value: unknown): value is InboxView {
	return typeof value === "string" && (INBOX_VIEWS as readonly string[]).includes(value);
}

/** The guest spoke last. A fact, not a judgment. */
export function yourTurn(conversation: Pick<Conversation, "unansweredInboundId">): boolean {
	return conversation.unansweredInboundId !== null;
}

function time(value: string | null): number {
	return value ? new Date(value).getTime() : 0;
}

type QueueFields = Pick<Conversation, "unansweredInboundId" | "crm" | "lastGuestInboundAt">;

/**
 * The CRM reports the lead won or lost (CONTEXT, "Resolved"), and the guest has not written
 * since. A guest who writes after the outcome is back in the queue: a lost lead writing
 * again is exactly who the agent must see.
 */
export function isResolved(
	conversation: Pick<Conversation, "crm" | "lastGuestInboundAt">,
): boolean {
	const crm = conversation.crm;
	if (!crm?.leadId || (crm.outcome !== "won" && crm.outcome !== "lost")) return false;
	if (!crm.outcomeAt || !conversation.lastGuestInboundAt) return true;
	return time(conversation.lastGuestInboundAt) <= time(crm.outcomeAt);
}

/** In the queue: Your turn and not resolved. */
export function inQueue(conversation: QueueFields): boolean {
	return yourTurn(conversation) && !isResolved(conversation);
}

/**
 * The one status a thread shows (on its row and header): the CRM's outcome while resolved,
 * otherwise whose turn it is. A resolved thread is not the agent's turn, even if the guest
 * spoke last before the outcome.
 */
export function threadStatus(conversation: QueueFields): "yourTurn" | "sent" | "won" | "lost" {
	if (isResolved(conversation) && conversation.crm?.outcome) {
		return conversation.crm.outcome === "won" ? "won" : "lost";
	}
	return yourTurn(conversation) ? "yourTurn" : "sent";
}

/** Still in the queue, but the guest last wrote more than 48 hours ago. */
export function isQuiet(conversation: QueueFields, now: number = Date.now()): boolean {
	const last = time(conversation.lastGuestInboundAt);
	return inQueue(conversation) && last > 0 && now - last > QUIET_AFTER_MS;
}

export function inView(conversation: QueueFields, view: InboxView): boolean {
	if (view === "all") return true;
	return view === "sent" ? !inQueue(conversation) : inQueue(conversation);
}

/** Oldest waiting guest first in the queue; most recent activity first elsewhere. */
export function compareForView(view: InboxView): (a: Conversation, b: Conversation) => number {
	return view === "yourTurn"
		? (a, b) => time(a.lastGuestInboundAt) - time(b.lastGuestInboundAt)
		: (a, b) => time(b.updatedAt) - time(a.updatedAt);
}

export type QueueCounts = Record<InboxView, number>;

export type QueueView = {
	/** Threads in the current view that match the search, in view order. */
	visible: Conversation[];
	/**
	 * The collapsed section at the bottom of the queue: Your-turn threads the guest last
	 * touched more than 48 hours ago, oldest first. Empty outside the Your turn view.
	 */
	quiet: Conversation[];
	/** Per-view totals for the same search, so tab counts agree with the list. Quiet counts. */
	counts: QueueCounts;
	/** Whether the queue is empty because every guest has been answered. */
	caughtUp: boolean;
};

export function buildQueueView(
	conversations: Conversation[],
	view: InboxView,
	query: string,
	now: number = Date.now(),
): QueueView {
	const matching = conversations.filter((conversation) => matchesThreadSearch(conversation, query));
	const counts: QueueCounts = { yourTurn: 0, sent: 0, all: matching.length };
	for (const conversation of matching) {
		if (inQueue(conversation)) counts.yourTurn += 1;
		else counts.sent += 1;
	}
	const inOrder = matching
		.filter((conversation) => inView(conversation, view))
		.sort(compareForView(view));
	const quiet =
		view === "yourTurn" ? inOrder.filter((conversation) => isQuiet(conversation, now)) : [];
	const visible =
		view === "yourTurn" ? inOrder.filter((conversation) => !isQuiet(conversation, now)) : inOrder;
	return {
		visible,
		quiet,
		counts,
		caughtUp:
			view === "yourTurn" &&
			!query.trim() &&
			conversations.length > 0 &&
			visible.length === 0 &&
			quiet.length === 0,
	};
}

/**
 * Which thread should be selected after the list changed. `ordered` is every thread the
 * operator can see, active then quiet. Keeps the current selection when it is still
 * there; otherwise the first thread; otherwise nothing. After a send in the queue view
 * the sent thread has left the list, so this is also what advances to the next waiting
 * guest.
 */
export function nextSelection(ordered: Conversation[], selectedId: string | null): string | null {
	if (selectedId && ordered.some((conversation) => conversation.id === selectedId)) {
		return selectedId;
	}
	return ordered[0]?.id ?? null;
}
