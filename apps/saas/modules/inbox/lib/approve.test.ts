import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test } from "vitest";

import { POST as approve } from "../../../app/api/conversations/[id]/approve/route";
import { GET as listConversations } from "../../../app/api/conversations/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { whatsappWindowState } from "./pipes";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";

async function json(res: Response): Promise<{ res: Response; body: Record<string, unknown> }> {
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	return { res, body };
}

function params(id: string): { params: Promise<{ id: string }> } {
	return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-"));
	setRuntimeForTests({
		store: createInboxStore(path.join(dir, "nhip.db")),
		sendMode: "mock",
		env: {
			WHATSAPP_VERIFY_TOKEN: "verify-me",
			SEND_MODE: "mock",
		},
	});
});

afterEach(async () => {
	const runtime = peekTestRuntime();
	if (runtime) {
		await runtime.store.close();
	}
	setRuntimeForTests(null);
});

test("inbound does not send; approve is required", async () => {
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pipe: "zalo",
					guestId: "guest-1",
					text: "Looking to rent in Tay Ho",
				}),
			}),
		),
	);
	expect(injected.res.status).toBe(200);
	const conv = injected.body.conversation as {
		id: string;
		sentAt: string | null;
		oneShot: { draft: { reply: string } };
		messages: Array<{ source: string }>;
	};
	expect(conv.oneShot.draft.reply).toBeTruthy();
	expect(conv.sentAt).toBeNull();
	expect(conv.messages.filter((message) => message.source === "nhip").length).toBe(0);

	const approved = await json(
		await approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		),
	);
	expect(approved.res.status).toBe(200);
	expect(approved.body.ok).toBe(true);
	const after = approved.body.conversation as {
		sentAt: string | null;
		lastSend: { mock: boolean };
		messages: Array<{ source: string }>;
	};
	expect(after.sentAt).toBeTruthy();
	expect(after.lastSend.mock).toBe(true);
	expect(after.messages.filter((message) => message.source === "nhip").length).toBe(1);
});

test("there is no send path except approve", async () => {
	await inject(
		new Request("http://localhost/dev/inbound", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				pipe: "whatsapp",
				guestId: "16315551181",
				text: "Hello",
			}),
		}),
	);
	const listed = await json(await listConversations());
	const first = (listed.body as unknown as Array<{ sentAt: string | null }>)[0];
	expect(first.sentAt).toBeNull();
});

test("WhatsApp approve outside 24h window is refused", async () => {
	const old = Date.now() - 25 * 60 * 60 * 1000;
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pipe: "whatsapp",
					guestId: "16315551181",
					text: "Still looking",
					at: old,
				}),
			}),
		),
	);
	const conv = injected.body.conversation as { id: string };
	const refused = await json(
		await approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		),
	);
	expect(refused.res.status).toBe(409);
	expect(refused.body.error).toBe("outside_24h_window");
	expect(String(refused.body.message)).toMatch(/template/i);
});

test("POST /dev/inbound is 404 in production", async () => {
	const prev = process.env.NODE_ENV;
	Object.assign(process.env, { NODE_ENV: "production" });
	try {
		const res = await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pipe: "zalo",
					guestId: "guest-1",
					text: "Looking to rent in Tay Ho",
				}),
			}),
		);
		expect(res.status).toBe(404);
	} finally {
		Object.assign(process.env, { NODE_ENV: prev });
	}
});

test("whatsappWindowState helper", () => {
	const open = whatsappWindowState({
		pipe: "whatsapp",
		lastGuestInboundAt: new Date().toISOString(),
	});
	expect(open.open).toBe(true);
	const closed = whatsappWindowState({
		pipe: "whatsapp",
		lastGuestInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
	});
	expect(closed.open).toBe(false);
	expect(closed.reason).toBe("outside_24h_window");
});
