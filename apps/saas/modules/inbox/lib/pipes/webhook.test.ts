import crypto from "node:crypto";

import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { settleBackgroundWork } from "../background";
import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { peekTestRuntime, setRuntimeForTests } from "../runtime";
import { resetTestInbox, testDb } from "../test-store";
import { handleInboundWebhook } from "./webhook";

/**
 * Webhook-created threads belong to the office that owns the pipe (ADR 0008). The Zalo
 * OA id is the office's side of the pipe; until an office has connected it, its inbound
 * is dropped rather than filed under nobody.
 */
const OA_SECRET = "oa-secret-key";
const APP_ID = "123456";
/** Signed now: Zalo requests outside the replay window are refused. */
const TS = String(Date.now());

function zaloRequest(guestId: string, text: string, oaId = "oa-1"): Request {
	const body = JSON.stringify({
		app_id: APP_ID,
		event_name: "user_send_text",
		timestamp: TS,
		sender: { id: guestId },
		recipient: { id: oaId },
		message: { text, msg_id: `m-${guestId}-${Date.now()}` },
	});
	const mac = crypto.createHash("sha256").update(`${APP_ID}${body}${TS}${OA_SECRET}`).digest("hex");
	return new Request("http://localhost/webhooks/zalo", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-zevent-signature": `mac=${mac}` },
		body,
	});
}

beforeEach(async () => {
	await resetTestInbox();
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig({ zalo: { oaSecretKey: OA_SECRET } }),
		drafts: noDraftAdapter,
	});
});

afterEach(async () => {
	// Alerts follow a guest message in the background (ADR 0019); they finish before the reset.
	await settleBackgroundWork();
	vi.restoreAllMocks();
	const runtime = peekTestRuntime();
	if (runtime) {
		await runtime.store.close();
	}
	setRuntimeForTests(null);
});

test("inbound on a pipe no office has connected is acknowledged and dropped", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const res = await handleInboundWebhook("zalo", zaloRequest("guest-1", "Xin chào"));
	expect(res.status).toBe(200);
	expect(await testDb.conversation.count()).toBe(0);
	expect(warn).toHaveBeenCalledWith(
		expect.stringMatching(/no office owns this pipe/),
		expect.objectContaining({ pipe: "zalo", pipeExternalId: "oa-1" }),
	);
});

test("inbound on a connected pipe is filed under that office and stays there", async () => {
	const store = peekTestRuntime()!.store;
	await store.connectPipe({ pipe: "zalo", externalId: "oa-1", officeId: "office-a" });
	await store.connectPipe({ pipe: "zalo", externalId: "oa-2", officeId: "office-b" });

	// "Xin chào" alone reads as English (ADR 0021): its à is shared with French.
	expect(
		(await handleInboundWebhook("zalo", zaloRequest("guest-1", "Xin chào, tôi muốn thuê căn hộ")))
			.status,
	).toBe(200);
	expect((await handleInboundWebhook("zalo", zaloRequest("guest-2", "Hello", "oa-2"))).status).toBe(
		200,
	);

	const a = await store.listConversations({
		userId: "manager",
		officeId: "office-a",
		role: "manager",
	});
	const b = await store.listConversations({
		userId: "manager",
		officeId: "office-b",
		role: "manager",
	});
	expect(a.map((c) => c.guestId)).toEqual(["guest-1"]);
	expect(b.map((c) => c.guestId)).toEqual(["guest-2"]);
	expect(a[0].officeId).toBe("office-a");
	expect(a[0].unansweredInboundId).toBe(a[0].messages[0].id);
	expect(a[0].oneShot?.language).toBe("vi");
	// Each message remembers the office endpoint it arrived on (ADR 0010).
	expect(a[0].messages[0].pipeExternalId).toBe("oa-1");
	expect(b[0].messages[0].pipeExternalId).toBe("oa-2");
	// Two threads, two opaque ids: neither names its guest (#141).
	expect(a[0].id).not.toBe(b[0].id);
	expect(a[0].id).not.toContain("guest-1");
	expect(b[0].id).not.toContain("guest-2");
});

// ADR 0017 and #141: the delivery log ties a delivery to the messages it filed, through the
// vendor id as stored (its keyed hash), never the raw id that can carry who the guest is.
test("a delivery is on the log with its message's stored vendor id, never the raw one", async () => {
	const store = peekTestRuntime()!.store;
	await store.connectPipe({ pipe: "zalo", externalId: "oa-1", officeId: "office-a" });
	const request = zaloRequest("guest-log", "Xin chào");
	const { message } = (await request.clone().json()) as { message: { msg_id: string } };

	expect((await handleInboundWebhook("zalo", request)).status).toBe(200);

	const [thread] = await store.listConversations({
		userId: "manager",
		officeId: "office-a",
		role: "manager",
	});
	const stored = thread.messages[0].vendorMessageId;
	expect(stored, "the message keeps a vendor id, for retries").toBeTruthy();
	expect(stored).not.toBe(message.msg_id);
	const [delivery] = await store.listWebhookDeliveries({ limit: 5, pipe: "zalo" });
	expect(delivery.outcome).toBe("processed");
	expect(delivery.vendorMessageIds, "the delivery names the message it filed").toEqual([stored]);
});

test("a bad signature is refused before anything is filed", async () => {
	const store = peekTestRuntime()!.store;
	await store.connectPipe({ pipe: "zalo", externalId: "oa-1", officeId: "office-a" });
	const request = zaloRequest("guest-1", "Xin chào");
	const tampered = new Request(request.url, {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-zevent-signature": "mac=abcd" },
		body: await request.text(),
	});
	expect((await handleInboundWebhook("zalo", tampered)).status).toBe(403);
	expect(await testDb.conversation.count()).toBe(0);
});
