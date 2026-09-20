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
import type { Conversation } from "./types";

type Body = Record<string, unknown>;

async function json(res: Response): Promise<{ res: Response; body: Body }> {
	const body = (await res.json().catch(() => ({}))) as Body;
	return { res, body };
}

function params(id: string): { params: Promise<{ id: string }> } {
	return { params: Promise.resolve({ id }) };
}

function post(url: string, body: unknown): Request {
	return new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

/** Inject a guest message through the dev route and return the thread. */
async function arrive(body: Body): Promise<Conversation> {
	const injected = await json(await inject(post("http://localhost/dev/inbound", body)));
	expect(injected.res.status).toBe(200);
	return injected.body.conversation as Conversation;
}

/**
 * Approve the way the client does: name the guest message being answered and the exact
 * text. `overrides` lets a test send a stale target, no target, or an empty reply.
 */
async function approveReply(
	conv: Conversation,
	overrides: Body = {},
): Promise<{ res: Response; body: Body }> {
	const body = {
		inboundId: conv.unansweredInboundId,
		reply: conv.oneShot?.draft.reply ?? "Thanks",
		...overrides,
	};
	return json(
		await approve(
			post(`http://localhost/api/conversations/${conv.id}/approve`, body),
			params(conv.id),
		),
	);
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
	vi.unstubAllGlobals();
	const runtime = peekTestRuntime();
	if (runtime) {
		await runtime.store.close();
	}
	setRuntimeForTests(null);
});

test("inbound does not send; approve is required, and it records an Answer", async () => {
	const conv = await arrive({
		pipe: "zalo",
		guestId: "guest-1",
		text: "Looking to rent in Tay Ho",
	});
	expect(conv.oneShot?.draft.reply).toBeTruthy();
	expect(conv.sentAt).toBeNull();
	expect(conv.answers).toEqual([]);
	expect(conv.messages.filter((message) => message.source === "nhip")).toHaveLength(0);

	const approved = await approveReply(conv);
	expect(approved.res.status).toBe(200);
	expect(approved.body.ok).toBe(true);
	const after = approved.body.conversation as Conversation;
	expect(after.sentAt).toBeTruthy();
	expect(after.unansweredInboundId).toBeNull();
	expect(after.messages.filter((message) => message.source === "nhip")).toHaveLength(1);
	expect(after.answers).toHaveLength(1);
	expect(after.lastAnswer).toMatchObject({
		inboundId: conv.unansweredInboundId,
		text: conv.oneShot?.draft.reply,
		operatorId: "walk-user",
		status: "sent",
		mock: true,
		pipe: "zalo",
		to: "guest-1",
	});
	expect(after.lastAnswer?.sentAt).toBeTruthy();
});

test("approve refuses a second send against the same guest message", async () => {
	const conv = await arrive({
		pipe: "zalo",
		guestId: "guest-already",
		text: "Looking to rent in Tay Ho",
	});
	expect((await approveReply(conv)).res.status).toBe(200);
	const second = await approveReply(conv);
	expect(second.res.status).toBe(409);
	expect(second.body.error).toBe("already_answered");
	expect(second.body.conversation).toBeUndefined();
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations")),
	);
	const thread = (listed.body as unknown as Conversation[]).find((item) => item.id === conv.id);
	expect(thread?.messages.filter((message) => message.source === "nhip")).toHaveLength(1);
	expect(thread?.answers).toHaveLength(1);
});

test("an approval names its target and its text: stale, missing and empty are refused", async () => {
	const conv = await arrive({ pipe: "zalo", guestId: "guest-target", text: "First question" });
	const firstInbound = conv.unansweredInboundId;

	// The guest writes again before the tap lands: the reply written for M1 must not go to M2.
	const again = await arrive({ pipe: "zalo", guestId: "guest-target", text: "Second question" });
	expect(again.unansweredInboundId).not.toBe(firstInbound);
	const stale = await approveReply(again, {
		inboundId: firstInbound,
		reply: "Answer to the first",
	});
	expect(stale.res.status).toBe(409);
	expect(stale.body.error).toBe("stale_target");

	const missing = await approveReply(again, { inboundId: undefined });
	expect(missing.res.status).toBe(400);
	expect(missing.body.error).toBe("inbound_required");

	// A cleared reply box is not a request to send the suggestion.
	const empty = await approveReply(again, { reply: "   " });
	expect(empty.res.status).toBe(400);
	expect(empty.body.error).toBe("empty_reply");

	const malformed = await json(
		await approve(
			post(`http://localhost/api/conversations/${again.id}/approve`, "{ not json"),
			params(again.id),
		),
	);
	expect(malformed.res.status).toBe(400);

	// Nothing above sent anything.
	const untouched = await peekTestRuntime()!.store.getConversation(again.id);
	expect(untouched?.answers).toEqual([]);
	expect(untouched?.unansweredInboundId).toBe(again.unansweredInboundId);

	// The right target with the operator's exact text goes through.
	const sent = await approveReply(again, { reply: "  Answer to the second  " });
	expect(sent.res.status).toBe(200);
	expect((sent.body.conversation as Conversation).lastAnswer?.text).toBe("Answer to the second");
});

test("a guest message arriving mid-send stays Your turn", async () => {
	const runtime = peekTestRuntime()!;
	const conv = await arrive({ pipe: "zalo", guestId: "guest-mid", text: "M1" });
	const m1 = conv.unansweredInboundId!;
	// Approval is on record; the vendor has not answered yet. M2 lands now.
	const begun = await runtime.store.beginAnswer({
		conversationId: conv.id,
		inboundId: m1,
		text: "Reply to M1",
		operatorId: "walk-user",
	});
	if (!begun.ok) throw new Error(begun.reason);
	const withM2 = await arrive({ pipe: "zalo", guestId: "guest-mid", text: "M2" });
	const m2 = withM2.unansweredInboundId!;
	expect(m2).not.toBe(m1);
	// The vendor acknowledges M1's reply; the outbound is now the last message on the thread.
	const done = await runtime.store.completeAnswer(begun.answer.id, {
		mock: true,
		pipe: "zalo",
		to: "guest-mid",
		vendorMessageId: "mock-1",
	});
	expect(done?.messages.at(-1)?.source).toBe("nhip");
	// M2 is still the guest's unanswered message: the queue does not read message order.
	expect(done?.unansweredInboundId).toBe(m2);
	expect((await approveReply(done!, { reply: "Reply to M2" })).res.status).toBe(200);
	expect((await runtime.store.getConversation(conv.id))?.unansweredInboundId).toBeNull();
});

test("a vendor success whose record fails is never sent twice", async () => {
	const runtime = peekTestRuntime()!;
	const conv = await arrive({ pipe: "zalo", guestId: "guest-record", text: "Hello" });
	const completeAnswer = runtime.store.completeAnswer.bind(runtime.store);
	let calls = 0;
	setRuntimeForTests({
		...runtime,
		store: {
			...runtime.store,
			completeAnswer: async (answerId, result) => {
				calls += 1;
				if (calls === 1) throw new Error("disk full");
				return completeAnswer(answerId, result);
			},
		},
	});
	const first = await approveReply(conv);
	expect(first.res.status).toBe(500);
	expect(first.body.error).toBe("record_failed");
	// The Answer stays on file as unknown, so a retry is refused rather than resent.
	const after = await runtime.store.getConversation(conv.id);
	expect(after?.lastAnswer).toMatchObject({ status: "unknown" });
	expect(after?.lastAnswer?.failureReason).toMatch(/disk full/);
	expect(after?.unansweredInboundId).toBeNull();
	const retry = await approveReply(conv);
	expect(retry.res.status).toBe(409);
	expect(retry.body.error).toBe("delivery_unknown");
	expect(after?.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
});

test("a definite vendor refusal may be retried; an ambiguous transport failure may not", async () => {
	const runtime = peekTestRuntime()!;
	setRuntimeForTests({
		...runtime,
		config: mockInboxConfig({
			sendMode: "live",
			zalo: { accessToken: "token", oaSecretKey: "secret" },
		}),
	});

	// Vendor says no: failed, retry allowed, and the retry can succeed.
	const refused = await arrive({ pipe: "zalo", guestId: "guest-refused", text: "Hello" });
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: -216, message: "token expired" }, { status: 401 })),
	);
	const failed = await approveReply(refused);
	expect(failed.res.status).toBe(502);
	expect(failed.body.error).toBe("send_failed");
	expect("detail" in failed.body).toBe(false);
	let state = await runtime.store.getConversation(refused.id);
	expect(state?.lastAnswer).toMatchObject({ status: "failed" });
	expect(state?.unansweredInboundId).toBe(refused.unansweredInboundId);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: 0, data: { message_id: "z-1" } })),
	);
	const retried = await approveReply(refused, { reply: "Second try" });
	expect(retried.res.status).toBe(200);
	state = await runtime.store.getConversation(refused.id);
	expect(state?.answers).toHaveLength(1);
	expect(state?.lastAnswer).toMatchObject({
		status: "sent",
		text: "Second try",
		vendorMessageId: "z-1",
		mock: false,
	});

	// The network fails: the vendor may have the message. Unknown, and not retried.
	const lost = await arrive({ pipe: "zalo", guestId: "guest-lost", text: "Hello" });
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			throw new TypeError("fetch failed");
		}),
	);
	const unknown = await approveReply(lost);
	expect(unknown.res.status).toBe(502);
	expect(unknown.body.error).toBe("delivery_unknown");
	state = await runtime.store.getConversation(lost.id);
	expect(state?.lastAnswer).toMatchObject({ status: "unknown" });
	expect(state?.unansweredInboundId).toBeNull();
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: 0, data: { message_id: "z-2" } })),
	);
	const blocked = await approveReply(lost);
	expect(blocked.res.status).toBe(409);
	expect(blocked.body.error).toBe("delivery_unknown");
	expect(state?.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
});

test("approve of a missing thread is 404", async () => {
	const missing = await json(
		await approve(
			post("http://localhost/api/conversations/zalo:missing/approve", {
				inboundId: "x",
				reply: "hi",
			}),
			params("zalo:missing"),
		),
	);
	expect(missing.res.status).toBe(404);
	expect(missing.body.error).toBe("not_found");
});

test("list and get conversation return the invented inbound", async () => {
	const conv = await arrive({
		pipe: "whatsapp",
		guestId: "demo-ru-ciputra",
		guestName: "Alexei",
		text: "Здравствуйте. Я русский, сейчас в Ханое. Ищу аренду в Ciputra, 2 bedroom, $2000/month.",
	});
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations")),
	);
	const fromList = (listed.body as unknown as Conversation[]).find((item) => item.id === conv.id);
	expect(fromList?.guestName).toBe("Alexei");

	const opened = await json(
		await getConversation(
			new Request(`http://localhost/api/conversations/${conv.id}`),
			params(conv.id),
		),
	);
	expect(opened.res.status).toBe(200);
	const body = opened.body as unknown as Conversation;
	expect(body.guestName).toBe("Alexei");
	expect(body.oneShot?.qualification.areaOfInterest).toBe("Ciputra");
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
	await arrive({ pipe: "whatsapp", guestId: "16315551181", text: "Hello" });
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations")),
	);
	const first = (listed.body as unknown as Conversation[])[0];
	expect(first.sentAt).toBeNull();
	expect(first.answers).toEqual([]);
});

test("WhatsApp approve outside 24h window is refused", async () => {
	const old = Date.now() - 25 * 60 * 60 * 1000;
	const conv = await arrive({
		pipe: "whatsapp",
		guestId: "16315551181",
		text: "Still looking",
		at: old,
	});
	const refused = await approveReply(conv);
	expect(refused.res.status).toBe(409);
	expect(refused.body.error).toBe("outside_24h_window");
	expect(String(refused.body.message)).toMatch(/template/i);
});

test("POST /dev/inbound is 404 in production", async () => {
	vi.stubEnv("NODE_ENV", "production");
	try {
		const res = await inject(
			post("http://localhost/dev/inbound", {
				pipe: "zalo",
				guestId: "guest-1",
				text: "Looking to rent in Tay Ho",
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
		const conv = await arrive({ pipe, guestId, text: "Hello" });
		expect(conv.pipe, pipe).toBe(pipe);
		// End to end: the value survives the write and the strict parse on the way back out.
		const stored = await peekTestRuntime()?.store.getConversation(`walk-office:${pipe}:${guestId}`);
		expect(stored?.pipe, pipe).toBe(pipe);
	}

	const outsideVocabulary = "definitely-not-a-pipe";
	expect(Pipe.options).not.toContain(outsideVocabulary);
	const refused = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: outsideVocabulary,
				guestId: "g",
				text: "Hello",
			}),
		),
	);
	expect(refused.res.status).toBe(400);
});

test("POST /dev/inbound rejects a bad body with 400, not 500", async () => {
	const attempt = async (body: unknown) =>
		json(await inject(post("http://localhost/dev/inbound", body)));

	// `at` used to reach `new Date(at).toISOString()` unchecked, where an unparsable value
	// threw RangeError and surfaced as an unhandled 500.
	const badAt = await attempt({
		pipe: "zalo",
		guestId: "guest-1",
		text: "Hello",
		at: "not-a-date",
	});
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
		const res = await attempt(body);
		expect(res.res.status, JSON.stringify(body)).toBe(400);
		expect(res.body.error).toBe("bad_request");
	}

	// A body that is not JSON at all is a 400, not a crash.
	const notJson = await json(await inject(post("http://localhost/dev/inbound", "{ not json")));
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
		const res = await json(await inject(post("http://localhost/dev/inbound", body)));
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
	const conv = await arrive({ pipe: "zalo", guestId: "guest-anon", text: "Hello" });
	vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

	// The dev injector files under the operator's office, so it needs a session too.
	const anonymous = await inject(
		post("http://localhost/dev/inbound", { pipe: "zalo", guestId: "guest-anon-2", text: "Hello" }),
	);
	expect(anonymous.status).toBe(401);

	const list = await listConversations(new Request("http://localhost/api/conversations"));
	expect(list.status).toBe(401);

	const detail = await getConversation(
		new Request(`http://localhost/api/conversations/${conv.id}`),
		params(conv.id),
	);
	expect(detail.status).toBe(401);

	const approved = await approveReply(conv, { reply: "attacker text" });
	expect(approved.res.status).toBe(401);

	const after = await peekTestRuntime()?.store.getConversation(conv.id);
	expect(after?.sentAt).toBeNull();
	expect(after?.answers).toEqual([]);
});

test("two concurrent approvals send exactly once", async () => {
	const conv = await arrive({ pipe: "zalo", guestId: "guest-race", text: "Hello" });
	const [a, b] = await Promise.all([approveReply(conv), approveReply(conv)]);
	const statuses = [a.res.status, b.res.status].sort((x, y) => x - y);
	expect(statuses).toEqual([200, 409]);
	const after = await peekTestRuntime()?.store.getConversation(conv.id);
	expect(after?.messages.filter((message) => message.source === "nhip")).toHaveLength(1);
	expect(after?.answers).toHaveLength(1);
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
	setRuntimeForTests({
		...runtime,
		config: mockInboxConfig({
			sendMode: "live",
			whatsapp: { accessToken: "token", phoneNumberId: "phone-a" },
		}),
	});
	const refused = await approveReply(conv, { reply: "Thanks" });
	expect(refused.res.status).toBe(409);
	expect(refused.body.error).toBe("pipe_not_configured");
	// Nothing was recorded, nothing was sent.
	const after = await runtime.store.getConversation(conv.id);
	expect(after?.unansweredInboundId).toBe(conv.unansweredInboundId);
	expect(after?.answers).toEqual([]);
	// In mock mode the same thread is fine: no vendor identity is at stake.
	setRuntimeForTests({ ...runtime, config: mockInboxConfig() });
	const mocked = await approveReply(conv, { reply: "Thanks" });
	expect(mocked.res.status).toBe(200);
	const sent = mocked.body.conversation as Conversation;
	// The outbound and the Answer record the endpoint they answered from.
	expect(sent.messages.at(-1)).toMatchObject({ source: "nhip", pipeExternalId: "phone-b" });
	expect(sent.lastAnswer).toMatchObject({ pipeExternalId: "phone-b", status: "sent" });
});

test("approve does not echo vendor error bodies, and missing credentials are a definite failure", async () => {
	const conv = await arrive({ pipe: "zalo", guestId: "guest-live", text: "Hello" });
	const runtime = peekTestRuntime();
	if (!runtime) throw new Error("runtime missing");
	// Live mode with no token: transmit refuses before any network call.
	setRuntimeForTests({ ...runtime, config: mockInboxConfig({ sendMode: "live" }) });
	const failed = await approveReply(conv);
	expect(failed.res.status).toBe(502);
	expect(failed.body.error).toBe("send_failed");
	expect("detail" in failed.body).toBe(false);
	// Nothing was sent, so the operator can retry once tokens exist.
	const after = await runtime.store.getConversation(conv.id);
	expect(after?.sentAt).toBeNull();
	expect(after?.lastAnswer).toMatchObject({ status: "failed" });
	expect(after?.unansweredInboundId).toBe(conv.unansweredInboundId);
});
