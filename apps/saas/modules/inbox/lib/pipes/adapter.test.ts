import crypto from "node:crypto";

import { expect, test } from "vitest";

import { mockInboxConfig } from "../config";
import type { Conversation } from "../types";
import { pipeAdapter, transmit } from "./index";

const conversation = { pipe: "whatsapp", guestId: "16315551181" } as Conversation;

test("transmit stays mock unless the send mode is exactly live, even with credentials", async () => {
	const result = await transmit({
		conversation,
		text: "hello",
		config: mockInboxConfig({ whatsapp: { accessToken: "token", phoneNumberId: "phone" } }),
	});
	expect(result.mock).toBe(true);
	expect(result.pipe).toBe("whatsapp");
	expect(result.to).toBe("16315551181");
});

test("live mode delegates to the pipe adapter, which refuses without credentials", async () => {
	await expect(
		transmit({ conversation, text: "hello", config: mockInboxConfig({ sendMode: "live" }) }),
	).rejects.toThrow(/WHATSAPP_ACCESS_TOKEN/);
	await expect(
		transmit({
			conversation: { pipe: "zalo", guestId: "z1" } as Conversation,
			text: "hello",
			config: mockInboxConfig({ sendMode: "live" }),
		}),
	).rejects.toThrow(/ZALO_OA_ACCESS_TOKEN/);
});

test("each adapter verifies its own header with its own secret and fails closed", () => {
	const body = JSON.stringify({ app_id: "1", timestamp: "2", entry: [] });
	const waSig = `sha256=${crypto.createHmac("sha256", "wa").update(body).digest("hex")}`;
	const zaloSig = `mac=${crypto.createHash("sha256").update(`1${body}2oa`).digest("hex")}`;
	const config = mockInboxConfig({ whatsapp: { appSecret: "wa" }, zalo: { oaSecretKey: "oa" } });

	expect(
		pipeAdapter("whatsapp").verifyInbound(
			body,
			new Headers({ "x-hub-signature-256": waSig }),
			config,
		),
	).toBe(true);
	expect(
		pipeAdapter("zalo").verifyInbound(body, new Headers({ "x-zevent-signature": zaloSig }), config),
	).toBe(true);
	// Wrong header for the pipe, or no secret configured, rejects.
	expect(
		pipeAdapter("zalo").verifyInbound(body, new Headers({ "x-hub-signature-256": waSig }), config),
	).toBe(false);
	expect(
		pipeAdapter("whatsapp").verifyInbound(
			body,
			new Headers({ "x-hub-signature-256": waSig }),
			mockInboxConfig(),
		),
	).toBe(false);
});

test("only WhatsApp has a send window; Zalo is always open", () => {
	const stale = {
		pipe: "whatsapp",
		lastGuestInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
	} as Conversation;
	expect(pipeAdapter("whatsapp").sendWindow(stale).open).toBe(false);
	expect(pipeAdapter("zalo").sendWindow({ ...stale, pipe: "zalo" }).open).toBe(true);
});
