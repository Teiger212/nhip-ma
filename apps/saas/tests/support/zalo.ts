import { createHash, randomUUID } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

/** A guest's text on Zalo: who wrote, to which OA, and what. */
export type ZaloText = { oaId: string; guestId: string; text: string };

/**
 * The webhook Zalo sends for a guest's text (`user_send_text`), signed as Zalo signs it with
 * the E2E env's app and secret, with a message id of its own. Answers the app's status.
 */
export async function sendZaloText(
	request: APIRequestContext,
	{ oaId, guestId, text }: ZaloText,
): Promise<number> {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: "user_send_text",
		timestamp,
		sender: { id: guestId },
		recipient: { id: oaId },
		message: { text, msg_id: `e2e-msg-${randomUUID()}` },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	const res = await request.post("/webhooks/zalo", {
		data: body,
		headers: { "content-type": "application/json", "X-ZEvent-Signature": `mac=${mac}` },
	});
	return res.status();
}
