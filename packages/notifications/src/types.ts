export const NOTIFICATION_TYPES = {
	WELCOME: "WELCOME",
	APP_UPDATE: "APP_UPDATE",
	PIPE_DISCONNECTED: "PIPE_DISCONNECTED",
} as const;

export type { NotificationTarget, NotificationType } from "@repo/database";
