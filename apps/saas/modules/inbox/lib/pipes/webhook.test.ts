import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { peekTestRuntime, setRuntimeForTests } from "../runtime";
import { handleInboundWebhook } from "./webhook";

/**
 * Webhook-created threads belong to the office that owns the pipe (ADR 0008). The Zalo
 * OA id is the office's side of the pipe; until an office has connected it, its inbound
 * is dropped rather than filed under nobody.
 */
const OA_SECRET = "oa-secret-key";
const APP_ID = "123456";
const TS = "1725600000000";

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

beforeEach(() => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-webhook-"));
	setRuntimeForTests({
		store: createInboxStore(path.join(dir, "nhip.db")),
		config: mockInboxConfig({ zalo: { oaSecretKey: OA_SECRET } }),
		drafts: noDraftAdapter,
	});
});

afterEach(async () => {
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
	const store = peekTestRuntime()!.store;
	expect(await store.listConversations()).toEqual([]);
	expect(warn).toHaveBeenCalledWith(
		expect.stringMatching(/no office owns this pipe/),
		expect.objectContaining({ pipe: "zalo", pipeExternalId: "oa-1" }),
	);
});

test("inbound on a connected pipe is filed under that office and stays there", async () => {
	const store = peekTestRuntime()!.store;
	await store.connectPipe({ pipe: "zalo", externalId: "oa-1", officeId: "office-a" });
	await store.connectPipe({ pipe: "zalo", externalId: "oa-2", officeId: "office-b" });

	expect((await handleInboundWebhook("zalo", zaloRequest("guest-1", "Xin chào"))).status).toBe(200);
	expect((await handleInboundWebhook("zalo", zaloRequest("guest-2", "Hello", "oa-2"))).status).toBe(
		200,
	);

	const a = await store.listConversations({ userId: "agent", officeId: "office-a" });
	const b = await store.listConversations({ userId: "agent", officeId: "office-b" });
	expect(a.map((c) => c.guestId)).toEqual(["guest-1"]);
	expect(b.map((c) => c.guestId)).toEqual(["guest-2"]);
	expect(a[0].officeId).toBe("office-a");
	expect(a[0].unansweredInboundId).toBe(a[0].messages[0].id);
	expect(a[0].oneShot?.language).toBe("vi");
	// Each message remembers the office endpoint it arrived on (ADR 0010).
	expect(a[0].messages[0].pipeExternalId).toBe("oa-1");
	expect(b[0].messages[0].pipeExternalId).toBe("oa-2");
	// Thread identity carries the office: the ids differ even for the same pipe.
	expect(a[0].id).toBe("office-a:zalo:guest-1");
	expect(b[0].id).toBe("office-b:zalo:guest-2");
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
	expect(await store.listConversations()).toEqual([]);
});
