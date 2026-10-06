import { askState } from "./state-client";

/** Setup only (see pipe-state.ts): an office's Zalo OA, connected or already disconnected. */
export async function connectZaloOa(
	officeId: string,
	oaId: string,
	state?: "disconnected",
): Promise<void> {
	await askState("pipes.connect", officeId, oaId, ...(state ? [state] : []));
}

/**
 * Setup: the office holds a WhatsApp number, the E2E env's unless given one, so signed WhatsApp
 * webhooks to it are filed there. Idempotent for the same office; one office at a time holds a
 * number. A spec with an office of its own gives it a number of its own (`newWhatsAppNumber` in
 * whatsapp.ts): the walk office holds the env's.
 */
export async function connectWhatsAppNumber(
	officeId: string,
	phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID,
): Promise<void> {
	if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set (the E2E env sets it)");
	await askState("pipes.connect-whatsapp", officeId, phoneNumberId);
}

/** Setup/cleanup: the office no longer holds the OA. */
export async function releaseZaloOa(oaId: string): Promise<void> {
	await askState("pipes.release", oaId);
}
