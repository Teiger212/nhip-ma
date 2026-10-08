import { createNotification, NOTIFICATION_TYPES } from "@repo/notifications";

import { runInBackground } from "../background";
import { namedLanguage } from "../language-name";
import type { Runtime } from "../runtime";
import type { Conversation } from "../types";
import { alertSounds } from "./burst";
import {
	type AlertLocale,
	type AlertTranslate,
	alertLink,
	alertLocale,
	guestAlertContent,
} from "./content";
import { inboxTranslator, RecipientsFailed } from "./index";
import { type OwnerChange, ownerChangeEffects } from "./recipients";
import { alertTag } from "./tag";
import { type AlertDelivery, type AlertTransport, alertTransport } from "./transport";

/** An assignment is a manager's deliberate act, never a burst: it always sounds (#133). */
const alwaysSounds = () => true;

/**
 * A manager's owner change, once `setOwner` has succeeded (ADR 0022 "Alerts", #133):
 * - the operator given the thread gets an `assigned` alert, pushed with the toast's words
 *   ("Minji was assigned to you"), and the bell row "A manager gave you a thread", which names
 *   no guest and opens the alert's own link;
 * - a thread back in Unassigned gives the other managers a `returned` alert ("Minji is
 *   waiting"), with no bell row;
 * - the operator it left gets the bell row naming the guest (P4), with `data.threadId` so guest
 *   deletion takes it (ADR 0020), and nothing pushed or logged as an alert.
 * Bell rows go through the kit's `createNotification`, which emails none of these types. One
 * recipient's failure never costs another theirs; the failures are thrown together, as kinds.
 */
export async function alertOwnerChange(
	runtime: Runtime,
	conversation: Conversation,
	change: OwnerChange,
	{
		now = () => new Date(),
		transport = alertTransport(runtime.config),
	}: { now?: () => Date; transport?: AlertTransport } = {},
): Promise<void> {
	const { store } = runtime;
	const { alert, movedFrom } = ownerChangeEffects(
		change,
		await store.officeOperators(conversation.officeId),
	);
	const guestName = conversation.guestName?.trim() || null;
	// Error kinds only: an error's text can carry guest data (PDPL).
	const failures: string[] = [];

	if (movedFrom) {
		try {
			await createNotification({
				userId: movedFrom.userId,
				type: NOTIFICATION_TYPES.THREAD_MOVED,
				data: { threadId: conversation.id, guestName },
			});
		} catch (error) {
			failures.push(error instanceof Error ? error.name : "unknown");
		}
	}

	if (alert) {
		const tag = alertTag(conversation.id);
		const translators = new Map<AlertLocale, AlertTranslate>();
		const deliveries: AlertDelivery[] = [];
		for (const recipient of alert.recipients) {
			try {
				const locale = alertLocale(recipient.locale);
				let t = translators.get(locale);
				if (!t) {
					t = await inboxTranslator(locale);
					translators.set(locale, t);
				}
				const content = guestAlertContent(
					{
						guestName,
						pipe: conversation.pipe,
						guestLanguage: conversation.oneShot ? namedLanguage(conversation.oneShot) : null,
					},
					t,
					locale,
				);
				const title =
					alert.kind === "assigned"
						? guestName
							? t("alerts.assignedToYou", { name: guestName })
							: t("alerts.assignedToYouUnnamed")
						: content.title;
				const recorded = await store.recordAlert({
					officeId: conversation.officeId,
					conversationId: conversation.id,
					userId: recipient.userId,
					kind: alert.kind,
					now: now(),
					link: (id) => alertLink(locale, id),
					sounds: alert.kind === "assigned" ? alwaysSounds : alertSounds,
				});
				deliveries.push({
					userId: recipient.userId,
					payload: {
						alertId: recorded.id,
						tag,
						title,
						body: content.body,
						url: recorded.link,
						sound: recorded.sounded,
					},
				});
				if (alert.kind === "assigned") {
					await createNotification({
						userId: recipient.userId,
						type: NOTIFICATION_TYPES.THREAD_ASSIGNED,
						link: recorded.link,
					});
				}
			} catch (error) {
				failures.push(error instanceof Error ? error.name : "unknown");
			}
		}
		try {
			await transport.send(deliveries);
		} catch (error) {
			failures.push(error instanceof Error ? error.name : "unknown");
		}
	}

	if (failures.length > 0) {
		throw new RecipientsFailed(failures);
	}
}

/**
 * The owner change's alerts and bell rows, in the background: the owner route never waits on
 * them, and a failure never undoes the change. It is logged as what failed, without the
 * thread's or guest's id, or the error's text, which can carry guest data (PDPL).
 */
export function scheduleOwnerChangeAlert(
	runtime: Runtime,
	conversation: Conversation,
	change: OwnerChange,
): void {
	// A failure is logged by its kind only (`runInBackground`, #220).
	void runInBackground("owner change alert", () => alertOwnerChange(runtime, conversation, change));
}
