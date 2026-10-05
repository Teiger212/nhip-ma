import { isPlatformAdmin } from "@repo/auth/lib/roles";
import type { AlertOperator } from "@repo/database/inbox";

/**
 * Who a guest's message alerts (ADR 0019 "Who", amended by ADR 0022). An Unassigned thread
 * alerts the office's managers only; an owned thread alerts its owner only. The platform admin is the kit `owner` of every
 * office they created, and that membership opens nothing (ADR 0015), so they are left out by
 * their platform role, as `resolveOffice` refuses them, not by member role. Recipients equal
 * visibility: an owner who is no longer a member cannot open the thread, so nobody is alerted.
 */
export function guestAlertRecipients(
	thread: { ownerId: string | null },
	operators: AlertOperator[],
): AlertOperator[] {
	return operators.filter(
		(operator) => !isPlatformAdmin(operator.platformRole) && alertsOperator(thread, operator),
	);
}

/**
 * The same rule from one operator's side: whether a guest's message on this thread is theirs to
 * hear about. The in-app toasts follow it (#136), so a manager is not toasted for an agent's
 * guest that no alert would bring them.
 */
export function alertsOperator(
	thread: { ownerId: string | null },
	operator: { userId: string; manager: boolean },
): boolean {
	return thread.ownerId === null ? operator.manager : thread.ownerId === operator.userId;
}

/** A manager's owner change (ADR 0022): who held the thread, who holds it now, who acted. */
export type OwnerChange = {
	previousOwnerId: string | null;
	newOwnerId: string | null;
	actorId: string;
};

/** What an owner change sets off (ADR 0022 "Alerts", #133). */
export type OwnerChangeEffects = {
	/** The push alert it makes, and to whom; null when it alerts no one. */
	alert: { kind: "assigned" | "returned"; recipients: AlertOperator[] } | null;
	/** The operator the thread moved away from, who gets the bell row naming the guest (P4). */
	movedFrom: AlertOperator | null;
};

/**
 * What a manager's owner change sets off (ADR 0022 "Alerts", #133), by the guest rule's terms:
 * recipients equal visibility (S2), and whoever acts is never alerted for it.
 * - Given to another operator: one `assigned` alert, to them.
 * - Back to Unassigned: one `returned` alert to each manager but the one who returned it.
 * - Taken away from an operator other than the one acting: they get the bell row (P4), whoever
 *   holds it now.
 * The same owner again changes nothing, so it sets off nothing. The platform admin is never an
 * operator here (`setOwner` refuses them as owner, and they are never alerted).
 */
export function ownerChangeEffects(
	{ previousOwnerId, newOwnerId, actorId }: OwnerChange,
	operators: AlertOperator[],
): OwnerChangeEffects {
	if (previousOwnerId === newOwnerId) return { alert: null, movedFrom: null };
	const reachable = operators.filter((operator) => !isPlatformAdmin(operator.platformRole));
	const recipients = reachable.filter(
		(operator) => operator.userId !== actorId && alertsOperator({ ownerId: newOwnerId }, operator),
	);
	const movedFrom =
		previousOwnerId === null || previousOwnerId === actorId
			? null
			: (reachable.find((operator) => operator.userId === previousOwnerId) ?? null);
	return {
		alert:
			recipients.length > 0
				? { kind: newOwnerId === null ? "returned" : "assigned", recipients }
				: null,
		movedFrom,
	};
}
