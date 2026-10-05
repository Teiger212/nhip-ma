import { isDecided } from "./crm/rules";
import { matchesThreadSearch } from "./search";
import type { ConversationSummary } from "./types";

/**
 * The inbox is a queue. These are the rules that define it (ADR 0004): "Your turn" is the
 * only pending state; a resolved thread (ADR 0003) leaves it; the quiet section holds the Your-turn threads the guest has not
 * touched for a while, and each view has one order. The client module renders a
 * QueueView; it does not restate any of this. The queue reads thread summaries, which is
 * all the list loads; the open thread is loaded whole on its own.
 */
export const INBOX_VIEWS = ["yourTurn", "sent", "all"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

/** A product constant, not a setting, until someone asks (ADR 0004). */
export const QUIET_AFTER_MS = 48 * 60 * 60 * 1000;

export function isInboxView(value: unknown): value is InboxView {
	return typeof value === "string" && (INBOX_VIEWS as readonly string[]).includes(value);
}

/** The guest spoke last. A fact, not a judgment. */
export function yourTurn(conversation: Pick<ConversationSummary, "unansweredInboundId">): boolean {
	return conversation.unansweredInboundId !== null;
}

/**
 * How many threads are Your turn: the inbox's tab count and the nav count alike. The count
 * route and the client both count with this, so which threads count is decided here and
 * nowhere else. The store only derives each thread's turn fact (`unansweredInboundId`).
 */
export function yourTurnCount(conversations: QueueFields[]): number {
	return conversations.filter(inQueue).length;
}

function time(value: string | null): number {
	return value ? new Date(value).getTime() : 0;
}

type QueueFields = Pick<ConversationSummary, "unansweredInboundId" | "crm" | "lastGuestInboundAt">;

/**
 * The CRM reports the lead won or lost (CONTEXT, "Resolved"), and the guest has not written
 * since Nhịp first saw that outcome (ADR 0003, Q3). A guest who writes after it is back in the
 * queue: a lost lead writing again is exactly who the agent must see. The CRM's own close date
 * never decides it, and a decided outcome with no observation time is not resolved: missing
 * data never hides a guest.
 */
export function isResolved(
	conversation: Pick<ConversationSummary, "crm" | "lastGuestInboundAt">,
): boolean {
	const crm = conversation.crm;
	if (!crm || !isDecided(crm.outcome) || !crm.outcomeObservedAt) {
		return false;
	}
	return time(conversation.lastGuestInboundAt) <= time(crm.outcomeObservedAt);
}

/** In the queue: Your turn and not resolved. */
export function inQueue(conversation: QueueFields): boolean {
	return yourTurn(conversation) && !isResolved(conversation);
}

/**
 * The one status a thread shows (its row and header): the CRM's outcome while resolved,
 * otherwise whose turn it is. A resolved thread is not the agent's turn, even if the guest
 * spoke last before the outcome.
 */
/** What a thread's status badge says: whose turn it is, or the CRM's outcome while resolved. */
export type ThreadStatus = "yourTurn" | "sent" | "won" | "lost";

export function threadStatus(conversation: QueueFields): ThreadStatus {
	if (isResolved(conversation)) return conversation.crm?.outcome === "won" ? "won" : "lost";
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
export function compareForView(
	view: InboxView,
): (a: ConversationSummary, b: ConversationSummary) => number {
	return view === "yourTurn"
		? (a, b) => time(a.lastGuestInboundAt) - time(b.lastGuestInboundAt)
		: (a, b) => time(b.updatedAt) - time(a.updatedAt);
}

export type QueueCounts = Record<InboxView, number>;

export type QueueView = {
	/** Threads in the current view that match the search, in view order. */
	visible: ConversationSummary[];
	/**
	 * The collapsed section at the bottom of the queue: Your-turn threads the guest last
	 * touched more than 48 hours ago, oldest first. Empty outside the Your turn view.
	 */
	quiet: ConversationSummary[];
	/** Per-view totals for the same search, so tab counts agree with the list. Quiet counts. */
	counts: QueueCounts;
	/** Whether the queue is empty because every guest has been answered. */
	caughtUp: boolean;
};

export function buildQueueView(
	conversations: ConversationSummary[],
	view: InboxView,
	query: string,
	now: number = Date.now(),
): QueueView {
	const matching = conversations.filter((conversation) => matchesThreadSearch(conversation, query));
	const counts: QueueCounts = { yourTurn: yourTurnCount(matching), sent: 0, all: matching.length };
	counts.sent = counts.all - counts.yourTurn;
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
export function nextSelection(
	ordered: ConversationSummary[],
	selectedId: string | null,
): string | null {
	if (selectedId && ordered.some((conversation) => conversation.id === selectedId)) {
		return selectedId;
	}
	return ordered[0]?.id ?? null;
}

/**
 * Home's Waiting now: the Your-turn threads in the queue's order (visible, then quiet).
 */
export function waitingNow(
	conversations: ConversationSummary[],
	_options: { manager: boolean },
	now: number = Date.now(),
): ConversationSummary[] {
	const queue = buildQueueView(conversations, "yourTurn", "", now);
	return [...queue.visible, ...queue.quiet];
}
