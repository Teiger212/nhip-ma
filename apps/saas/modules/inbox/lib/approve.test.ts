import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createInboxStore, Pipe } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", () => ({
	getOrganizationMembershipsForUser: vi.fn(async () => [{ organizationId: "walk-office" }]),
}));

import { auth } from "@repo/auth";

import { POST as approve } from "../../../app/api/conversations/[id]/approve/route";
import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
import { GET as listConversations } from "../../../app/api/conversations/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { mockInboxConfig } from "./config";
import { noDraftAdapter } from "./drafts";
import { whatsappWindowState } from "./pipes/vendors";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";

async function json(res: Response): Promise<{ res: Response; body: Record<string, unknown> }> {
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	return { res, body };
}

function params(id: string): { params: Promise<{ id: string }> } {
	return { params: Promise.resolve({ id }) };
}

const WALK_SESSION = {
	session: { id: "walk-session", activeOrganizationId: "walk-office" },
	user: { id: "walk-user" },
};

beforeEach(() => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-"));
	setRuntimeForTests({
		store: createInboxStore(path.join(dir, "nhip.db")),
		config: mockInboxConfig({ whatsapp: { verifyToken: "verify-me" } }),
		drafts: noDraftAdapter,
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

test("approve refuses a second send against the same guest message", async () => {
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
	expect(second.body.error).toBe("already_answered");
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
	vi.stubEnv("NODE_ENV", "production");
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
		vi.unstubAllEnvs();
	}
});

test("the pipe vocabulary is single-sourced in schema.ts", async () => {
	// `Pipe` being importable as a value at all is the point: the app checks against the
	// same declaration the store parses with. Driving the loop off `Pipe.options` rather
	// than a literal list is what makes this a drift detector — add a member to schema.ts
	// and this covers it automatically, so any consumer that restated the old list fails
	// here on the new member instead of silently rejecting it at runtime.
	expect(Pipe.options.length).toBeGreaterThan(0);
	for (const pipe of Pipe.options) {
		const guestId = `vocab-${pipe}`;
		const res = await json(
			await inject(
				new Request("http://localhost/dev/inbound", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ pipe, guestId, text: "Hello" }),
				}),
			),
		);
		expect(res.res.status, pipe).toBe(200);
		// End to end: the value survives the write and the strict parse on the way back out.
		const stored = await peekTestRuntime()?.store.getConversation(`walk-office:${pipe}:${guestId}`);
		expect(stored?.pipe, pipe).toBe(pipe);
	}

	const outsideVocabulary = "definitely-not-a-pipe";
	expect(Pipe.options).not.toContain(outsideVocabulary);
	const refused = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pipe: outsideVocabulary, guestId: "g", text: "Hello" }),
			}),
		),
	);
	expect(refused.res.status).toBe(400);
});

test("POST /dev/inbound rejects a bad body with 400, not 500", async () => {
	const post = async (body: unknown) =>
		json(
			await inject(
				new Request("http://localhost/dev/inbound", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
			),
		);

	// `at` used to reach `new Date(at).toISOString()` unchecked, where an unparsable value
	// threw RangeError and surfaced as an unhandled 500.
	const badAt = await post({ pipe: "zalo", guestId: "guest-1", text: "Hello", at: "not-a-date" });
	expect(badAt.res.status).toBe(400);
	expect(badAt.body.error).toBe("bad_request");
	expect(String(badAt.body.message)).toMatch(/at/);

	for (const body of [
		{ pipe: "sms", guestId: "guest-1", text: "Hello" },
		{ pipe: "zalo", guestId: "   ", text: "Hello" },
		{ pipe: "zalo", guestId: "guest-1", text: "" },
		{ pipe: "zalo", guestId: "guest-1" },
		{ pipe: "zalo", guestId: "guest-1", text: "Hello", at: Number.NaN },
		{},
	]) {
		const res = await post(body);
		expect(res.res.status, JSON.stringify(body)).toBe(400);
		expect(res.body.error).toBe("bad_request");
	}

	// A body that is not JSON at all is a 400, not a crash.
	const notJson = await json(
		await inject(
			new Request("http://localhost/dev/inbound", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{ not json",
			}),
		),
	);
	expect(notJson.res.status).toBe(400);
});

test("POST /dev/inbound still accepts the shapes it always did", async () => {
	const cases: Array<Record<string, unknown>> = [
		{ pipe: "zalo", guestId: " guest-trim ", text: " Looking to rent in Tay Ho " },
		{ pipe: "whatsapp", guestId: "g2", text: "Hello", at: Date.now() },
		{ pipe: "whatsapp", guestId: "g3", text: "Hello", at: new Date().toISOString() },
		// A wrong-typed optional field degrades to null rather than failing the request.
		{ pipe: "zalo", guestId: "g4", text: "Hello", guestName: 42, vendorMessageId: 7 },
	];
	for (const body of cases) {
		const res = await json(
			await inject(
				new Request("http://localhost/dev/inbound", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
			),
		);
		expect(res.res.status, JSON.stringify(body)).toBe(200);
	}
	const runtime = peekTestRuntime();
	const trimmed = await runtime?.store.getConversation("walk-office:zalo:guest-trim");
	expect(trimmed?.messages[0]?.text).toBe("Looking to rent in Tay Ho");
	const degraded = await runtime?.store.getConversation("walk-office:zalo:g4");
	expect(degraded?.guestName).toBeNull();
	expect(degraded?.messages[0]?.vendorMessageId).toBeNull();
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
	vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

	// The dev injector files under the operator's office, so it needs a session too.
	const anonymous = await inject(
		new Request("http://localhost/dev/inbound", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pipe: "zalo", guestId: "guest-anon-2", text: "Hello" }),
		}),
	);
	expect(anonymous.status).toBe(401);

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

test("a live reply is refused when the thread arrived on a number these credentials do not own", async () => {
	const runtime = peekTestRuntime();
	if (!runtime) throw new Error("runtime missing");
	// The guest wrote to the office's second number; this deployment can only send from "phone-a".
	const conv = await runtime.store.upsertInbound(
		{
			pipe: "whatsapp",
			source: "guest",
			guestId: "16315551199",
			guestName: null,
			text: "Hello",
			vendorMessageId: null,
			pipeExternalId: "phone-b",
		},
		"walk-office",
	);
	await runtime.store.setOneShot(conv.id, {
		language: "en",
		qualification: {
			areaOfInterest: null,
			nationality: null,
			inVietnamNow: null,
			rentOrBuy: null,
			timeframe: null,
			budgetBand: null,
			bedsOrHousehold: null,
		},
		paperwork: { mentioned: false, flag: null },
		draft: { reply: "Thanks", answersMessageId: conv.unansweredInboundId, source: "template" },
	});
	setRuntimeForTests({
		...runtime,
		config: mockInboxConfig({
			sendMode: "live",
			whatsapp: { accessToken: "token", phoneNumberId: "phone-a" },
		}),
	});
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
	expect(refused.body.error).toBe("pipe_not_configured");
	// Nothing was claimed, nothing was sent.
	const after = await runtime.store.getConversation(conv.id);
	expect(after?.unansweredInboundId).toBe(conv.unansweredInboundId);
	expect(after?.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
	// In mock mode the same thread is fine: no vendor identity is at stake.
	setRuntimeForTests({ ...runtime, config: mockInboxConfig() });
	const mocked = await json(
		await approve(
			new Request(`http://localhost/api/conversations/${conv.id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			params(conv.id),
		),
	);
	expect(mocked.res.status).toBe(200);
	const sent = mocked.body.conversation as {
		messages: Array<{ source: string; pipeExternalId: string | null }>;
	};
	// The outbound records the endpoint it answered from.
	expect(sent.messages.at(-1)).toMatchObject({ source: "nhip", pipeExternalId: "phone-b" });
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
	setRuntimeForTests({ ...runtime, config: mockInboxConfig({ sendMode: "live" }) });
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
