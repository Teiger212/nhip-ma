import { isPlatformAdmin } from "@repo/auth/lib/roles";
import type { AlertOperator } from "@repo/database/inbox";

/** An office member as the alert rules see them (ADR 0019). */
export type OfficeOperator = AlertOperator;

/**
 * Who a guest's message alerts (ADR 0019 "Who"). A pool thread alerts every operator of the
 * office; an owned thread alerts its owner only. The platform admin is the kit `owner` of every
 * office they created, and that membership opens nothing (ADR 0015), so they are left out by
 * their platform role, as `resolveOffice` refuses them, not by member role. Recipients equal
 * visibility: an owner who is no longer a member cannot open the thread, so nobody is alerted.
 */
export function guestAlertRecipients(
	thread: { ownerId: string | null },
	operators: OfficeOperator[],
): OfficeOperator[] {
	const operating = operators.filter((operator) => !isPlatformAdmin(operator.platformRole));
	if (thread.ownerId === null) {
		return operating;
	}
	return operating.filter((operator) => operator.userId === thread.ownerId);
}
