import {
	getUserEmailLocaleForNotifications,
	insertNotification,
	isNotificationDisabled,
	NotificationTarget,
	type NotificationModel,
	type NotificationType,
} from "@repo/database";
import type { Locale } from "@repo/i18n";
import { sendEmail } from "@repo/mail";

import { NOTIFICATION_GROUPS } from "./catalog";
import { resolveNotificationLink } from "./resolve-link";

/**
 * The only types that may email (PRODUCT.md "Deliberately not": no notification emails).
 * The kit's welcome stays as it is for now; every other type is a bell row only, whatever
 * the person's email preferences say.
 */
const EMAIL_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>(["WELCOME"]);

/** Only a type the settings offer can be turned off; any other (a broken pipe) always lands. */
const CONFIGURABLE_TYPES: ReadonlySet<string> = new Set(
	NOTIFICATION_GROUPS.flatMap((group) => group.types),
);

export async function createNotification(input: {
	userId: string;
	type: NotificationType;
	data?: unknown;
	link?: string | null;
	read?: boolean;
}) {
	const inAppDisabled =
		CONFIGURABLE_TYPES.has(input.type) &&
		(await isNotificationDisabled(input.userId, input.type, NotificationTarget.IN_APP));

	const emailDisabled =
		!EMAIL_TYPES.has(input.type) ||
		(await isNotificationDisabled(input.userId, input.type, NotificationTarget.EMAIL));

	const absoluteLink = resolveNotificationLink(input.link);
	let created: NotificationModel | null = null;

	if (!inAppDisabled) {
		created = await insertNotification({
			userId: input.userId,
			type: input.type,
			data: input.data ?? {},
			link: absoluteLink,
			read: input.read ?? false,
		});
	}

	if (!emailDisabled) {
		const userRow = await getUserEmailLocaleForNotifications(input.userId);

		if (userRow?.email) {
			const locale = (userRow.locale as Locale | null | undefined) ?? undefined;
			const dataObj =
				input.data &&
				typeof input.data === "object" &&
				input.data !== null &&
				!Array.isArray(input.data)
					? (input.data as Record<string, unknown>)
					: {};
			const title =
				typeof dataObj.headline === "string" && dataObj.headline.length > 0
					? dataObj.headline
					: typeof dataObj.title === "string" && dataObj.title.length > 0
						? dataObj.title
						: String(input.type);
			const message = typeof dataObj.message === "string" ? dataObj.message : undefined;

			await sendEmail({
				to: userRow.email,
				locale,
				templateId: "notification",
				context: {
					title,
					message,
					link: absoluteLink ?? undefined,
				},
			});
		}
	}

	return created;
}
