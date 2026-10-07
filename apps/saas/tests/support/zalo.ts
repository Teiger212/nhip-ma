import { createHash, randomUUID } from "node:crypto";

import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/** One webhook delivery exactly as Zalo signs it: posting it again is Zalo's retry of it. */
export type ZaloDelivery = { body: string; headers: Record<string, string> };

/** A text on a guest's thread with a Zalo OA, as Zalo sends it to the webhook. */
export type ZaloText = {
	guestId: string;
	oaId: string;
	text: string;
	/** Zalo's message id; a new one unless given. */
	msgId?: string;
	/**
	 * Who wrote it: the guest (Zalo's `user_send_text`, the default), or the office from the Zalo
	 * app (`oa_send_text`, which Zalo echoes to the webhook).
	 */
	from?: "guest" | "office";
	/** When it was written (Zalo's `timestamp`, which the app keeps as the message's time): now unless given. */
	at?: Date;
};

/** A text on a guest's thread with a Zalo OA, signed as Zalo signs it (the E2E env's app and secret). */
export function signedZaloText(message: ZaloText): ZaloDelivery {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String((message.at ?? new Date()).getTime());
	const fromOffice = message.from === "office";
	const body = JSON.stringify({
		app_id: appId,
		event_name: fromOffice ? "oa_send_text" : "user_send_text",
		timestamp,
		sender: { id: fromOffice ? message.oaId : message.guestId },
		recipient: { id: fromOffice ? message.guestId : message.oaId },
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
 * A text on a guest's thread with a Zalo OA, delivered as Zalo sends and signs it (`POST
 * /webhooks/zalo`, the E2E env's app and secret): the guest's unless `from: "office"`. Fails the
 * test unless the app takes it.
 */
export async function sendZaloText(request: APIRequestContext, message: ZaloText) {
	await deliverZalo(request, signedZaloText(message));
}
