import { pushSubscriptionsForSession } from "@repo/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { runInBackground } from "../background";
import type { Runtime } from "../runtime";
import { alertLink } from "./content";
import { inboxTranslator } from "./index";
import { normalizePushEndpoint } from "./push";
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
	// Stored in the normal form it was checked in, which is what the push posts to.
	endpoint: z
		.string()
		.max(2048)
		.transform((endpoint, ctx) => {
			const normal = normalizePushEndpoint(endpoint);
			if (!normal) {
				ctx.addIssue({ code: "custom", message: "not an allowed push service" });
				return z.NEVER;
			}
			return normal;
		}),
	keys: z.object({ p256dh: base64urlOf(65), auth: base64urlOf(16) }),
});

/**
 * The platform admin looking through an operator's eyes (the kit's impersonation) never makes
 * their own browser one of that operator's devices.
 */
export function refuseImpersonation(session: { impersonated: boolean }): Response | null {
	return session.impersonated
		? NextResponse.json({ error: "impersonating" }, { status: 403 })
		: null;
}

/** A test alert's tag: a new one replaces the last on the device, like a thread's. */
export const TEST_ALERT_TAG = "nhip-test";

export type TestAlertOutcome = "sent" | "no_device";

/**
 * "Send test alert" (ADR 0019): a sounding `test` row for the operator, in the office language
 * (ADR 0025), and in a live deployment a push to this sign-in's devices only, in the background. With no
 * device on this sign-in nothing is written.
 */
export async function sendTestAlert(
	runtime: Runtime,
	who: { userId: string; officeId: string; sessionId: string },
	{
		now = () => new Date(),
		transport = alertTransport(runtime.config),
	}: { now?: () => Date; transport?: AlertTransport } = {},
): Promise<TestAlertOutcome> {
	const devices = await pushSubscriptionsForSession(who.userId, who.sessionId);
	if (devices.length === 0) return "no_device";
	const locale = await runtime.store.officeLanguage(who.officeId);
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
	const payload = {
		alertId: alert.id,
		tag: TEST_ALERT_TAG,
		title: t("alerts.testTitle"),
		body: t("alerts.testBody"),
		url: alert.link,
		sound: alert.sounded,
	};
	// An error's text can name the device or the operator; the log keeps only its kind (#220).
	void runInBackground("test alert", () =>
		transport.send([{ userId: who.userId, sessionId: who.sessionId, payload }]),
	);
	return "sent";
}
