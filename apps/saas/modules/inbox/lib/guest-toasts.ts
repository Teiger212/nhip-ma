import { alertsOperator } from "./guest-alerts/recipients";
import { inQueue } from "./queue";
import type { ConversationSummary } from "./types";

/** At most this many guest toasts at once (spec #84): a fourth guest's replaces the oldest. */
export const GUEST_TOASTS_MAX = 3;

/** How recent a guest's message on a thread new to the list must be to count as just written. */
export const JUST_WROTE_MS = 30_000;

/** What a guest toast says: the guest wrote, or a manager just gave the operator the thread. */
export type GuestToastKind = "waiting" | "assigned";

type Operator = { userId: string; manager: boolean };

/** What a poll saw of each listed thread: the message it waits on (null when answered) and its owner. */
export type ListedThread = { message: string | null; ownerId: string | null };

export function listed(threads: ConversationSummary[]): Map<string, ListedThread> {
	return new Map(
		threads.map((thread) => [
			thread.id,
			{ message: thread.unansweredInboundId, ownerId: thread.owner?.id ?? null },
		]),
	);
}

/**
 * The threads a "waiting" toast can be about (#136): the operator's own Your-turn threads, by the
 * alert recipients' rule (an agent's assigned threads; a manager's Unassigned ones and their
 * own), each with the guest message it waits on.
 */
export function waitingOn(threads: ConversationSummary[], operator: Operator): Map<string, string> {
	const waiting = new Map<string, string>();
	for (const thread of threads) {
		if (
			thread.unansweredInboundId &&
			inQueue(thread) &&
			alertsOperator({ ownerId: thread.owner?.id ?? null }, operator)
		) {
			waiting.set(thread.id, thread.unansweredInboundId);
		}
	}
	return waiting;
}

/**
 * The toasts one poll raises, against what the last poll saw (#136):
 * - **assigned**: the thread is now the operator's and wasn't before (Eyal, 2026-10-05), unless
 *   it was their own doing (`ownAction`: giving it to themselves, a manager's reply claiming it).
 *   The previous owner loses the thread and gets nothing; a thread returned to Unassigned has
 *   no new owner, so it toasts no one.
 * - **waiting**: one of the operator's own waiting threads waits on another message than before.
 *   A thread new to the list counts only when its guest wrote in the last moments, so a
 *   thread an agent just gained shows as assigned, not as a guest writing.
 */
export function guestToasts(
	before: Map<string, ListedThread>,
	threads: ConversationSummary[],
	operator: Operator,
	{
		now = Date.now(),
		ownAction = () => false,
	}: { now?: number; ownAction?: (threadId: string) => boolean } = {},
): { threadId: string; kind: GuestToastKind }[] {
	const waiting = waitingOn(threads, operator);
	const raised: { threadId: string; kind: GuestToastKind }[] = [];
	for (const thread of threads) {
		const previous = before.get(thread.id);
		const ownerId = thread.owner?.id ?? null;
		if (ownerId === operator.userId && previous?.ownerId !== operator.userId) {
			if (!ownAction(thread.id)) raised.push({ threadId: thread.id, kind: "assigned" });
			continue;
		}
		const message = waiting.get(thread.id);
		if (!message) continue;
		const wrote = previous
			? previous.message !== message
			: now - (thread.lastGuestInboundAt ? new Date(thread.lastGuestInboundAt).getTime() : 0) <=
				JUST_WROTE_MS;
		if (wrote) raised.push({ threadId: thread.id, kind: "waiting" });
	}
	return raised;
}

/** Whether an open toast still has something to say: its guest still waits, or is still theirs. */
export function toastStands(
	kind: GuestToastKind,
	thread: ConversationSummary | undefined,
	operator: Operator,
): boolean {
	if (!thread) return false;
	return kind === "assigned"
		? thread.owner?.id === operator.userId
		: waitingOn([thread], operator).has(thread.id);
}
