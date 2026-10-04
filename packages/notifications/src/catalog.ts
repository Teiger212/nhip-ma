/** Section id for i18n (`settings.notificationsPage.groups.${id}`) and ordering. */
export type NotificationGroupId = "general";

/** Mirrors Prisma `NotificationType` — keep in sync with schema. */
export type NotificationTypeId = "WELCOME" | "APP_UPDATE" | "PIPE_DISCONNECTED";

/** Types a person may turn off; a broken pipe always reaches the platform admin. */
export type ConfigurableNotificationTypeId = Exclude<NotificationTypeId, "PIPE_DISCONNECTED">;

export interface NotificationGroupConfig {
	id: NotificationGroupId;
	/** Notification types in this section, in display order. */
	types: readonly ConfigurableNotificationTypeId[];
}

/**
 * Ordered groups for the notification preferences UI.
 * Reorder this list or the `types` arrays to change settings layout without DB migrations.
 */
export const NOTIFICATION_GROUPS: readonly NotificationGroupConfig[] = [
	{
		id: "general",
		types: ["APP_UPDATE"],
	},
];
