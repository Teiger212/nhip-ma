import { getMessagesForLocale } from "@repo/i18n";
import { createTranslator } from "next-intl";

import { runInBackground } from "../background";
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
import { guestAlertRecipients } from "./recipients";
import { alertTag } from "./tag";
import { alertTransport } from "./transport";

/** How long the alert log keeps a row: well past any link an operator still opens. */
export const ALERT_RETENTION_DAYS = 30;

async function inboxTranslator(locale: AlertLocale): Promise<AlertTranslate> {
	const messages = await getMessagesForLocale(locale, "saas");
	// The catalog is loaded untyped here, so next-intl cannot check keys; the content tests do.
	return createTranslator({ locale, messages, namespace: "inbox" }) as unknown as AlertTranslate;
}

/**
 * A guest's new message alerts the operators who can open the thread (ADR 0019): the pool's
 * operators, or the owner. Each gets one row in the log, decided by the burst rule under the
 * store's lock, in their own language, and the transport sends it (nothing in a mock
 * deployment). Recipients are written one after another, so one message's alerts never
 * compete with each other for connections.
 */
export async function alertGuestMessage(
	runtime: Runtime,
	conversation: Conversation,
	now: () => Date = () => new Date(),
): Promise<void> {
	const { store, config } = runtime;
	const operators = await store.officeOperators(conversation.officeId);
	const recipients = guestAlertRecipients({ ownerId: conversation.owner?.id ?? null }, operators);
	if (recipients.length > 0) {
		const tag = alertTag(conversation.id);
		const transport = alertTransport(config);
		const translators = new Map<AlertLocale, AlertTranslate>();
		for (const recipient of recipients) {
			const locale = alertLocale(recipient.locale);
			let t = translators.get(locale);
			if (!t) {
				t = await inboxTranslator(locale);
				translators.set(locale, t);
			}
			const { title, body } = guestAlertContent(
				{
					guestName: conversation.guestName,
					pipe: conversation.pipe,
					guestLanguage: conversation.oneShot?.language ?? null,
				},
				t,
			);
			const alert = await store.recordAlert({
				officeId: conversation.officeId,
				conversationId: conversation.id,
				userId: recipient.userId,
				kind: "guest",
				now: now(),
				link: (id) => alertLink(locale, id),
				sounds: alertSounds,
			});
			await transport.send(recipient.userId, {
				alertId: alert.id,
				tag,
				title,
				body,
				url: alert.link,
				sound: alert.sounded,
			});
		}
	}
	// Retention without a scheduler, like webhook deliveries: about one alert in a hundred prunes.
	if (Math.random() < 0.01) {
		await store.pruneAlerts(new Date(Date.now() - ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000));
	}
}

/**
 * Alerts for a guest message the store has just inserted, after the one-shot (so the language
 * is known), in the background: the webhook never waits on them. A failure is logged as what
 * failed, without the thread's id or the error's text, which can carry guest data (PDPL).
 */
export function scheduleGuestAlert(runtime: Runtime, conversation: Conversation): void {
	void runInBackground("guest alert", async () => {
		try {
			await alertGuestMessage(runtime, conversation);
		} catch (error) {
			throw new Error(`guest alert failed (${error instanceof Error ? error.name : "unknown"})`);
		}
	});
}
