/**
 * The alert log as a test sees it (ADR 0019; run in the state process, state-process.ts, for
 * `alerts.ts`). A phone's lock screen is out of a test's reach, so E2E reads the log a mock
 * deployment writes instead: one row per operator per alert. Reading it is looking at the
 * operators' phones. Nothing here writes, and every read is a fresh query.
 */
import { db } from "@repo/database";

/** The office's alerts, oldest first. */
export function officeAlerts(officeId: string) {
	return db.inboxAlert.findMany({
		where: { officeId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: {
			id: true,
			userId: true,
			conversationId: true,
			officeId: true,
			kind: true,
			sounded: true,
			link: true,
			createdAt: true,
		},
	});
}

/** The operator's devices, oldest first. */
export function operatorDevices(userId: string) {
	return db.pushSubscription.findMany({
		where: { userId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: { id: true, userId: true },
	});
}
