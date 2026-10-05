import { execFileSync } from "node:child_process";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import path from "node:path";

import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/** A WhatsApp guest: their phone number is their WhatsApp id (wa_id); the Inbox lists them by name. */
export type WhatsAppGuest = { phone: string; name: string };

/**
 * Setup (tests/support/pipe-state.ts): the office holds this WhatsApp number, so signed WhatsApp
 * webhooks to it are filed there. Give each test a number of its own (`newWhatsAppNumber`), never
 * the E2E env's, which the walk office holds for other specs.
 */
export function holdWhatsAppNumber(officeId: string, phoneNumberId: string) {
	execFileSync(
		"pnpm",
		[
			"exec",
			"tsx",
			"--tsconfig",
			"tsconfig.json",
			"tests/support/pipe-state.ts",
			"connect-whatsapp",
			officeId,
			phoneNumberId,
		],
		{ cwd: path.resolve(__dirname, "../.."), stdio: "inherit" },
	);
}

/** A phone_number_id no other test, repeat or run uses. */
export function newWhatsAppNumber(tag: string): string {
	return `e2e-${tag}-${randomUUID()}`;
}

/** A guest with a Vietnamese mobile number no other test, repeat or run uses, and a name of their own. */
export function newWhatsAppGuest(): WhatsAppGuest {
	const phone = `849${randomInt(100_000_000, 1_000_000_000)}`;
	return { phone, name: `Guest ${randomUUID().slice(0, 8)}` };
}

/**
 * The guest's text to the office's number as Meta sends and signs it (`POST /webhooks/whatsapp`,
 * `X-Hub-Signature-256` with the E2E env's WHATSAPP_APP_SECRET), written at `at` (now unless
 * given): WhatsApp's `timestamp` is when the guest wrote. Fails the test unless the app takes it.
 */
export async function sendWhatsAppText(
	request: APIRequestContext,
	message: { phoneNumberId: string; guest: WhatsAppGuest; text: string; at?: Date },
) {
	const secret = process.env.WHATSAPP_APP_SECRET;
	if (!secret) throw new Error("WHATSAPP_APP_SECRET comes from the E2E env");
	const at = message.at ?? new Date();
	const body = JSON.stringify({
		entry: [
			{
				changes: [
					{
						value: {
							metadata: { phone_number_id: message.phoneNumberId },
							contacts: [{ wa_id: message.guest.phone, profile: { name: message.guest.name } }],
							messages: [
								{
									from: message.guest.phone,
									id: `wamid.${randomUUID()}`,
									timestamp: String(Math.floor(at.getTime() / 1000)),
									type: "text",
									text: { body: message.text },
								},
							],
						},
					},
				],
			},
		],
	});
	const signature = createHmac("sha256", secret).update(body).digest("hex");
	const res = await request.post("/webhooks/whatsapp", {
		data: body,
		headers: { "content-type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
	});
	expect(res.ok(), `the WhatsApp webhook takes the message (${res.status()})`).toBe(true);
}
