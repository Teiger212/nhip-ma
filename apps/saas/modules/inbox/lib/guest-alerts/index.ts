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
import { type AlertDelivery, type AlertTransport, alertTransport } from "./transport";

/** How long the alert log keeps a row: well past any link an operator still opens. */
export const ALERT_RETENTION_DAYS = 30;

/** Some recipients' alerts failed; says how many and the first error's kind, nothing more. */
class RecipientsFailed extends Error {
	constructor(kinds: string[]) {
		super(`failed for ${kinds.length} recipient(s) (${kinds[0]})`);
		this.name = "RecipientsFailed";
	}
}

/**
 * Alerts are rendered in the background (`after()`), in scripts and in tests: outside a request,
 * so `next-intl/server`'s request config is not there. The core translator renders the same
 * catalogs.
 */
export async function inboxTranslator(locale: AlertLocale): Promise<AlertTranslate> {
	const messages = await getMessagesForLocale(locale, "saas");
	// The catalog is loaded untyped here, so next-intl cannot check keys; alert-log.test.ts
	// renders through this translator.
	return createTranslator({ locale, messages, namespace: "inbox" }) as unknown as AlertTranslate;
}

/**
 * A guest's new message alerts the operators who can open the thread (ADR 0019): the pool's
 * operators, or the owner. Each gets one row in the log, decided by the burst rule under the
 * store's lock, in their own language. Rows are written one after another, so one message's
 * alerts never compete with each other for connections; one operator's failure never costs
 * the others theirs. Then the transport sends them all at once (nothing in a mock
 * deployment), so a slow push service delays no one (#134, Q4).
 */
export async function alertGuestMessage(
	runtime: Runtime,
	conversation: Conversation,
	{
		now = () => new Date(),
		transport = alertTransport(runtime.config),
	}: { now?: () => Date; transport?: AlertTransport } = {},
): Promise<void> {
	const { store } = runtime;
	const operators = await store.officeOperators(conversation.officeId);
	const recipients = guestAlertRecipients({ ownerId: conversation.owner?.id ?? null }, operators);
	const tag = recipients.length > 0 ? alertTag(conversation.id) : "";
	const translators = new Map<AlertLocale, AlertTranslate>();
	// Error kinds only: an error's text can carry guest data (PDPL).
	const failures: string[] = [];
	const deliveries: AlertDelivery[] = [];
	for (const recipient of recipients) {
		try {
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
			deliveries.push({
				userId: recipient.userId,
				payload: { alertId: alert.id, tag, title, body, url: alert.link, sound: alert.sounded },
			});
		} catch (error) {
			failures.push(error instanceof Error ? error.name : "unknown");
		}
	}
	try {
		await transport.send(deliveries);
	} catch (error) {
		failures.push(error instanceof Error ? error.name : "unknown");
	}
	if (failures.length > 0) {
		throw new RecipientsFailed(failures);
	}
	// Retention without a scheduler, like webhook deliveries: about one alert in a hundred prunes.
	if (Math.random() < 0.01) {
		await store.pruneAlerts(new Date(now().getTime() - ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000));
	}
}

/**
 * Alerts for a guest message the store has just inserted, after the one-shot (so the language
 * is known), in the background: the webhook never waits on them. A failure is logged as what
 * failed, without the thread's id or the error's text, which can carry guest data (PDPL).
 */
export function scheduleGuestAlert(
	runtime: Runtime,
	conversation: Conversation,
	transport: AlertTransport = alertTransport(runtime.config),
): void {
	void runInBackground("guest alert", async () => {
		try {
			await alertGuestMessage(runtime, conversation, { transport });
		} catch (error) {
			if (error instanceof RecipientsFailed) throw error;
			throw new Error(`guest alert failed (${error instanceof Error ? error.name : "unknown"})`);
		}
	});
}
