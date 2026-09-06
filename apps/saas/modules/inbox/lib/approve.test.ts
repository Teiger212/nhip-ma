import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

import { auth } from "@repo/auth";

import { POST as approve } from "../../../app/api/conversations/[id]/approve/route";
import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
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

const WALK_SESSION = { session: { id: "walk-session" }, user: { id: "walk-user" } };

beforeEach(() => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
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

test("approve refuses a second send on an already-sent thread", async () => {
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pipe: "zalo",
					guestId: "guest-already",
					text: "Looking to rent in Tay Ho",
				}),
			}),
		),
	);
	const conv = injected.body.conversation as { id: string };
	const first = await json(
		await approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		),
	);
	expect(first.res.status).toBe(200);
	const second = await json(
		await approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		),
	);
	expect(second.res.status).toBe(409);
	expect(second.body.error).toBe("already_sent");
	const after = second.body.conversation as { messages?: Array<{ source: string }> } | undefined;
	expect(after).toBeUndefined();
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations")),
	);
	const thread = (
		listed.body as unknown as Array<{ id: string; messages: Array<{ source: string }> }>
	).find((item) => item.id === conv.id);
	expect(thread?.messages.filter((message) => message.source === "nhip").length).toBe(1);
});

test("approve of a missing thread is 404", async () => {
	const missing = await json(
		await approve(
			new Request("http://localhost/api/conversations/zalo:missing/approve", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params("zalo:missing"),
		),
	);
	expect(missing.res.status).toBe(404);
	expect(missing.body.error).toBe("not_found");
});

test("list and get conversation return the invented inbound", async () => {
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pipe: "whatsapp",
					guestId: "demo-ru-ciputra",
					guestName: "Alexei",
					text: "Здравствуйте. Я русский, сейчас в Ханое. Ищу аренду в Ciputra, 2 bedroom, $2000/month.",
				}),
			}),
		),
	);
	const conv = injected.body.conversation as { id: string };
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations")),
	);
	const fromList = (listed.body as unknown as Array<{ id: string; guestName: string | null }>).find(
		(item) => item.id === conv.id,
	);
	expect(fromList?.guestName).toBe("Alexei");

	const opened = await json(
		await getConversation(
			new Request(`http://localhost/api/conversations/${conv.id}`),
			params(conv.id),
		),
	);
	expect(opened.res.status).toBe(200);
	const body = opened.body as unknown as {
		guestName: string;
		oneShot: { qualification: { areaOfInterest: string | null } };
		messages: Array<{ text: string }>;
	};
	expect(body.guestName).toBe("Alexei");
	expect(body.oneShot.qualification.areaOfInterest).toBe("Ciputra");
	expect(body.messages[0]?.text).toMatch(/Ciputra/);

	const missing = await json(
		await getConversation(
			new Request("http://localhost/api/conversations/zalo:missing"),
			params("zalo:missing"),
		),
	);
	expect(missing.res.status).toBe(404);
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
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations")),
	);
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

test("inbox routes refuse requests without a session", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pipe: "zalo", guestId: "guest-anon", text: "Hello" }),
			}),
		),
	);
	const conv = injected.body.conversation as { id: string; sentAt: string | null };

	const list = await listConversations(new Request("http://localhost/api/conversations"));
	expect(list.status).toBe(401);

	const detail = await getConversation(
		new Request(`http://localhost/api/conversations/${conv.id}`),
		params(conv.id),
	);
	expect(detail.status).toBe(401);

	const approved = await approve(
		new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reply: "attacker text" }),
		}),
		params(conv.id),
	);
	expect(approved.status).toBe(401);

	const runtime = peekTestRuntime();
	const after = await runtime?.store.getConversation(conv.id);
	expect(after?.sentAt).toBeNull();
});

test("two concurrent approvals send exactly once", async () => {
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pipe: "zalo", guestId: "guest-race", text: "Hello" }),
			}),
		),
	);
	const conv = injected.body.conversation as { id: string };
	const request = () =>
		approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		);
	const [a, b] = await Promise.all([request(), request()]);
	const statuses = [a.status, b.status].sort((x, y) => x - y);
	expect(statuses).toEqual([200, 409]);

	const runtime = peekTestRuntime();
	const after = await runtime?.store.getConversation(conv.id);
	expect(after?.messages.filter((message) => message.source === "nhip").length).toBe(1);
});

test("approve does not echo vendor error bodies", async () => {
	const injected = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pipe: "zalo", guestId: "guest-live", text: "Hello" }),
			}),
		),
	);
	const conv = injected.body.conversation as { id: string };
	const runtime = peekTestRuntime();
	if (!runtime) throw new Error("runtime missing");
	// Live mode with no token: transmit throws before any network call.
	setRuntimeForTests({ ...runtime, sendMode: "live", env: { SEND_MODE: "live" } });
	const failed = await json(
		await approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		),
	);
	expect(failed.res.status).toBe(502);
	expect(failed.body.error).toBe("send_failed");
	expect("detail" in failed.body).toBe(false);
	// The failed claim is released so the operator can retry once tokens exist.
	const after = await runtime.store.getConversation(conv.id);
	expect(after?.sentAt).toBeNull();
});
