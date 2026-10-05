export const NOTIFICATION_TYPES = {
	WELCOME: "WELCOME",
	APP_UPDATE: "APP_UPDATE",
	PIPE_DISCONNECTED: "PIPE_DISCONNECTED",
	/** A manager gave the reader a thread (ADR 0022, #133); names no guest. */
	THREAD_ASSIGNED: "THREAD_ASSIGNED",
	/** A manager moved the reader's thread away from them (ADR 0022, P4); names the guest. */
	THREAD_MOVED: "THREAD_MOVED",
} as const;

export type { NotificationTarget, NotificationType } from "@repo/database";
