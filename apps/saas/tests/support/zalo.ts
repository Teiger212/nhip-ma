import { createHash, randomUUID } from "node:crypto";

import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/** One webhook delivery exactly as Zalo signs it: posting it again is Zalo's retry of it. */
export type ZaloDelivery = { body: string; headers: Record<string, string> };

/**
 * A guest's text to a Zalo OA, signed as Zalo signs it (the E2E env's app and secret), with
 * its own message id unless given one.
 */
export function signedZaloText(message: {
	guestId: string;
	oaId: string;
	text: string;
	msgId?: string;
}): ZaloDelivery {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: "user_send_text",
		timestamp,
		sender: { id: message.guestId },
		recipient: { id: message.oaId },
		message: { text: message.text, msg_id: message.msgId ?? randomUUID() },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	return {
		body,
		headers: { "content-type": "application/json", "X-ZEvent-Signature": `mac=${mac}` },
	};
}

/** Posts a signed delivery to `POST /webhooks/zalo`. Fails the test unless the app takes it. */
export async function deliverZalo(request: APIRequestContext, delivery: ZaloDelivery) {
	const res = await request.post("/webhooks/zalo", {
		data: delivery.body,
		headers: delivery.headers,
	});
	expect(res.ok(), `the Zalo webhook is taken (${res.status()})`).toBe(true);
}

/**
 * A guest's text to a Zalo OA, delivered as Zalo sends and signs it (`POST /webhooks/zalo`,
 * the E2E env's app and secret). Fails the test unless the app takes it.
 */
export async function sendZaloText(
	request: APIRequestContext,
	message: { guestId: string; oaId: string; text: string },
) {
	await deliverZalo(request, signedZaloText(message));
}
