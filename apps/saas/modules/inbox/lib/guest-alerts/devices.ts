import { pushSubscriptionsForSession } from "@repo/database";
import { z } from "zod";

import { runInBackground } from "../background";
import type { Runtime } from "../runtime";
import { alertLink, alertLocale } from "./content";
import { inboxTranslator } from "./index";
import { isAllowedPushEndpoint } from "./push";
import { type AlertTransport, alertTransport } from "./transport";

/** A base64url string that decodes to exactly `bytes` bytes. */
function base64urlOf(bytes: number) {
	return z
		.string()
		.regex(/^[A-Za-z0-9_-]+={0,2}$/)
		.refine((value) => Buffer.from(value, "base64url").length === bytes);
}

/**
 * What a browser's `PushSubscription.toJSON()` gives the page to post (#134): an `https`
 * endpoint on an allowed push service, the device's P-256 public key (65 bytes, uncompressed)
 * and its 16-byte auth secret. Anything else is refused, so the server never posts to an
 * arbitrary URL.
 */
export const DeviceRegistration = z.object({
	endpoint: z.string().max(2048).refine(isAllowedPushEndpoint),
	keys: z.object({ p256dh: base64urlOf(65), auth: base64urlOf(16) }),
});

/** A test alert's tag: a new one replaces the last on the device, like a thread's. */
export const TEST_ALERT_TAG = "nhip-test";

export type TestAlertOutcome = "sent" | "no_device";

/**
 * "Send test alert" (ADR 0019): a sounding `test` row for the operator, in their language, and
 * in a live deployment a push to this sign-in's devices only, in the background. With no
 * device on this sign-in nothing is written.
 */
export async function sendTestAlert(
	runtime: Runtime,
	who: { userId: string; officeId: string; sessionId: string; locale: string | null },
	{
		now = () => new Date(),
		transport = alertTransport(runtime.config),
	}: { now?: () => Date; transport?: AlertTransport } = {},
): Promise<TestAlertOutcome> {
	const devices = await pushSubscriptionsForSession(who.userId, who.sessionId);
	if (devices.length === 0) return "no_device";
	const locale = alertLocale(who.locale);
	const t = await inboxTranslator(locale);
	const alert = await runtime.store.recordAlert({
		officeId: who.officeId,
		conversationId: null,
		userId: who.userId,
		kind: "test",
		now: now(),
		link: (id) => alertLink(locale, id),
		sounds: () => true,
	});
	void runInBackground("test alert", () =>
		transport.send([
			{
				userId: who.userId,
				sessionId: who.sessionId,
				payload: {
					alertId: alert.id,
					tag: TEST_ALERT_TAG,
					title: t("alerts.testTitle"),
					body: t("alerts.testBody"),
					url: alert.link,
					sound: alert.sounded,
				},
			},
		]),
	);
	return "sent";
}
