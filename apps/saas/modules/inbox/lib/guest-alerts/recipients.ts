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
