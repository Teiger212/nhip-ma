import crypto from "node:crypto";

import { expect, test } from "vitest";

import { mockInboxConfig } from "../config";
import type { Conversation, Store } from "../types";
import { pipeAdapter, transmit } from "./index";

const conversation = { pipe: "whatsapp", guestId: "16315551181" } as Conversation;

/** Only `pipeCredentialState` is read on these paths; nothing is connected. */
const store = { pipeCredentialState: async () => null } as unknown as Store;

test("transmit stays mock unless the send mode is exactly live, even with credentials", async () => {
	const result = await transmit({
		conversation,
		text: "hello",
		from: "phone",
		store,
		config: mockInboxConfig({ whatsapp: { accessToken: "token", phoneNumberId: "phone" } }),
	});
	expect(result.mock).toBe(true);
	expect(result.pipe).toBe("whatsapp");
	expect(result.to).toBe("16315551181");
});

test("a live deployment mocks a thread with no endpoint and refuses an unconnected one", async () => {
	const live = mockInboxConfig({ sendMode: "live" });
	const demo = await transmit({ conversation, text: "hello", from: null, store, config: live });
	expect(demo.mock).toBe(true);
	await expect(
		transmit({ conversation, text: "hello", from: "phone-b", store, config: live }),
	).rejects.toThrow(/not connected/);
	await expect(
		transmit({
			conversation: { pipe: "zalo", guestId: "z1" } as Conversation,
			text: "hello",
			from: "oa-1",
			store,
			config: live,
		}),
	).rejects.toThrow(/not connected/);
});

test("each adapter verifies its own header with its own secret and fails closed", () => {
	const ts = String(Date.now());
	const body = JSON.stringify({ app_id: "1", timestamp: ts, entry: [] });
	const waSig = `sha256=${crypto.createHmac("sha256", "wa").update(body).digest("hex")}`;
	const zaloSig = `mac=${crypto.createHash("sha256").update(`1${body}${ts}oa`).digest("hex")}`;
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
