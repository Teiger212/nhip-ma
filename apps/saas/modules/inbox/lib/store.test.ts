import { conversationId } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { oneShot } from "./draft";
import { testDb, testInboxStore } from "./test-store";

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
/** The id of a Zalo thread in office A. */
const zalo = (guestId: string) => conversationId(OFFICE, "zalo", guestId);

const inbound = (guestId: string, text = "Xin chào", pipeExternalId: string | null = null) => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text,
	vendorMessageId: null,
	pipeExternalId,
});

const mockSend = (to: string) => ({
	mock: true,
	pipe: "zalo" as const,
	to,
	vendorMessageId: `mock-${to}`,
});

type Store = Awaited<ReturnType<typeof testInboxStore>>;

/** Approve and deliver in one go: the happy path of an Answer (ADR 0011). */
async function answer(store: Store, conversationId: string, inboundId: string, text: string) {
	const begun = await store.beginAnswer({ conversationId, inboundId, text, operatorId: "agent-1" });
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	return store.completeAnswer(begun.answer.id, mockSend(conversationId.split(":").at(-1) ?? ""));
}

test("one Answer per guest message: two approvals in the same instant let one in", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("race"), OFFICE);
	const inboundId = conv.unansweredInboundId!;
	const input = { conversationId: zalo("race"), inboundId, text: "reply", operatorId: "agent-1" };
	const [first, second] = await Promise.all([store.beginAnswer(input), store.beginAnswer(input)]);
	const outcomes = [first, second].map((r) => (r.ok ? "ok" : r.reason)).sort();
	expect(outcomes).toEqual(["in_progress", "ok"]);
	expect(await testDb.answer.count({ where: { inboundId } })).toBe(1);
	await store.close();
});

test("message ids are unique cuids, not COUNT(*)+1", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const conv = await store.upsertInbound(inbound("g1"), OFFICE);
	expect(conv.messages).toHaveLength(2);
	const ids = new Set(conv.messages.map((message) => message.id));
	expect(ids.size).toBe(2);
	for (const id of ids) {
		expect(id).not.toMatch(/^zalo:g1:\d+$/);
	}
	await store.close();
});

test("threads belong to one office, are shared inside it and invisible outside it", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("ours"), OFFICE);
	await store.upsertInbound(inbound("theirs"), OTHER_OFFICE);

	const agentA = { userId: "agent-1", officeId: OFFICE };
	const agentA2 = { userId: "agent-2", officeId: OFFICE };
	const agentB = { userId: "agent-3", officeId: OTHER_OFFICE };
	const theirs = conversationId(OTHER_OFFICE, "zalo", "theirs");

	// Any agent in the office sees the office's threads; nobody sees another office's.
	expect((await store.listConversations(agentA)).map((c) => c.guestId)).toEqual(["ours"]);
	expect((await store.listConversations(agentA2)).map((c) => c.guestId)).toEqual(["ours"]);
	expect((await store.listConversations(agentB)).map((c) => c.guestId)).toEqual(["theirs"]);
	expect(await store.getConversation(theirs, agentA)).toBeNull();
	expect((await store.getConversation(theirs, agentB))?.officeId).toBe(OTHER_OFFICE);

	// Scripts and tests without a viewer still see everything.
	expect(await store.listConversations()).toHaveLength(2);
	await store.close();
});

test("one thread per guest per office: the same guest at two offices never merges", async () => {
	const store = await testInboxStore();
	const atA = await store.upsertInbound(inbound("same-guest", "private A"), OFFICE);
	const atB = await store.upsertInbound(inbound("same-guest", "private B"), OTHER_OFFICE);
	expect(atA.id).toBe(zalo("same-guest"));
	expect(atB.id).toBe(conversationId(OTHER_OFFICE, "zalo", "same-guest"));
	expect(atA.id).not.toBe(atB.id);
	expect(atA.messages.map((m) => m.text)).toEqual(["private A"]);
	expect(atB.messages.map((m) => m.text)).toEqual(["private B"]);
	// A follow-up at A lands in A's thread only.
	const again = await store.upsertInbound(inbound("same-guest", "again A"), OFFICE);
	expect(again.id).toBe(atA.id);
	expect(again.messages.map((m) => m.text)).toEqual(["private A", "again A"]);
	expect((await store.getConversation(atB.id))?.messages).toHaveLength(1);
	await store.close();
});

test("each message remembers the office endpoint it travelled through", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("ep", "hi", "oa-1"), OFFICE);
	expect(conv.messages[0].pipeExternalId).toBe("oa-1");
	const sent = await answer(store, conv.id, conv.messages[0].id, "hello");
	// The reply went out on the endpoint the guest wrote to.
	expect(sent?.messages[1]).toMatchObject({ source: "nhip", pipeExternalId: "oa-1" });
	// A dev injection has no endpoint, and that is allowed.
	const dev = await store.upsertInbound(inbound("ep", "again"), OFFICE);
	expect(dev.messages[2].pipeExternalId).toBeNull();
	await store.close();
});

test("a pipe endpoint maps to the office that owns it", async () => {
	const store = await testInboxStore();
	expect(await store.officeForPipe("whatsapp", "phone-1")).toBeNull();
	await store.connectPipe({ pipe: "whatsapp", externalId: "phone-1", officeId: OFFICE });
	await store.connectPipe({ pipe: "zalo", externalId: "oa-1", officeId: OFFICE });
	expect(await store.officeForPipe("whatsapp", "phone-1")).toBe(OFFICE);
	expect(await store.officeForPipe("zalo", "oa-1")).toBe(OFFICE);
	// The same vendor id on another pipe is a different endpoint.
	expect(await store.officeForPipe("zalo", "phone-1")).toBeNull();
	// Reconnecting moves the endpoint.
	await store.connectPipe({ pipe: "zalo", externalId: "oa-1", officeId: OTHER_OFFICE });
	expect(await store.officeForPipe("zalo", "oa-1")).toBe(OTHER_OFFICE);
	expect(await store.listPipeConnections()).toEqual([
		{ pipe: "whatsapp", externalId: "phone-1", officeId: OFFICE },
		{ pipe: "zalo", externalId: "oa-1", officeId: OTHER_OFFICE },
	]);
	await store.close();
});

test("your turn is derived from the messages: the guest spoke last and nothing answers it", async () => {
	const store = await testInboxStore();
	const fresh = await store.upsertInbound(inbound("turn"), OFFICE);
	const firstInbound = fresh.messages[0].id;
	expect(fresh.unansweredInboundId).toBe(firstInbound);

	// Two guest messages in a row: the latest is the one to answer.
	const burst = await store.upsertInbound(inbound("turn", "and one more thing"), OFFICE);
	const secondInbound = burst.messages[1].id;
	expect(burst.unansweredInboundId).toBe(secondInbound);

	const sent = await answer(store, zalo("turn"), secondInbound, "reply");
	expect(sent?.unansweredInboundId).toBeNull();
	expect(sent?.sentAt).toBeTruthy();

	// The guest writes back: Your turn again, and sentAt is no longer terminal.
	const back = await store.upsertInbound(inbound("turn", "thanks, one question"), OFFICE);
	expect(back.unansweredInboundId).toBe(back.messages[3].id);
	expect(back.sentAt).toBe(sent?.sentAt);

	// An agent answering from the OA app directly also ends the guest's turn.
	const echoed = await store.upsertInbound(
		{ ...inbound("turn", "answered from the OA app"), source: "oa-echo" },
		OFFICE,
	);
	expect(echoed.unansweredInboundId).toBeNull();
	await store.close();
});

test("an Answer is on record from approval and carries the send's lifecycle", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("life", "hi", "oa-1"), OFFICE);
	const inboundId = conv.unansweredInboundId!;
	const input = { conversationId: zalo("life"), inboundId, text: "reply", operatorId: "agent-1" };

	// Approval writes the row before any vendor call, and the guest's turn is over already.
	const begun = await store.beginAnswer(input);
	if (!begun.ok) throw new Error(begun.reason);
	expect(begun.answer).toMatchObject({
		inboundId,
		text: "reply",
		operatorId: "agent-1",
		status: "sending",
		pipe: "zalo",
		to: "life",
		pipeExternalId: "oa-1",
		sentAt: null,
	});
	expect((await store.getConversation(zalo("life")))?.unansweredInboundId).toBeNull();
	expect((await store.getConversation(zalo("life")))?.messages).toHaveLength(1);

	// A second approval while the first is in flight is refused.
	expect(await store.beginAnswer(input)).toEqual({ ok: false, reason: "in_progress" });

	// The vendor refused: failed, the guest's turn is back, and the retry reuses the row.
	await store.failAnswer(begun.answer.id, "token expired");
	let state = await store.getConversation(zalo("life"));
	expect(state?.lastAnswer).toMatchObject({ status: "failed", failureReason: "token expired" });
	expect(state?.unansweredInboundId).toBe(inboundId);
	const retried = await store.beginAnswer({ ...input, text: "second try", operatorId: "agent-2" });
	if (!retried.ok) throw new Error(retried.reason);
	expect(retried.answer.id).toBe(begun.answer.id);
	expect(retried.answer).toMatchObject({
		status: "sending",
		text: "second try",
		operatorId: "agent-2",
		failedAt: null,
		failureReason: null,
	});

	// The vendor acknowledged: sent, the outbound on the thread, the office's sentAt set.
	const done = await store.completeAnswer(retried.answer.id, {
		mock: false,
		pipe: "zalo",
		to: "life",
		vendorMessageId: "z-1",
	});
	expect(done?.lastAnswer).toMatchObject({ status: "sent", vendorMessageId: "z-1", mock: false });
	expect(done?.lastAnswer?.sentAt).toBeTruthy();
	expect(done?.sentAt).toBe(done?.lastAnswer?.sentAt);
	expect(done?.messages.at(-1)).toMatchObject({
		source: "nhip",
		text: "second try",
		pipeExternalId: "oa-1",
		vendorMessageId: "z-1",
	});
	expect(done?.answers).toHaveLength(1);

	// Once sent, the same guest message cannot be answered again, by any path.
	expect(await store.beginAnswer(input)).toEqual({ ok: false, reason: "already_answered" });
	await expect(store.completeAnswer(retried.answer.id, mockSend("life"))).rejects.toThrow(/sent/);
	// Failing or marking a sent Answer is a no-op.
	await store.failAnswer(retried.answer.id, "late");
	await store.markAnswerUnknown(retried.answer.id, "late");
	expect((await store.getConversation(zalo("life")))?.lastAnswer?.status).toBe("sent");
	// Only a guest message can be answered.
	const outbound = done!.messages.find((message) => message.direction === "out")!;
	await expect(store.beginAnswer({ ...input, inboundId: outbound.id })).rejects.toThrow(
		/guest message/,
	);
	await store.close();
});

test("an Answer of unknown outcome blocks every further approval of that message", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("unknown"), OFFICE);
	const inboundId = conv.unansweredInboundId!;
	const input = { conversationId: zalo("unknown"), inboundId, text: "reply", operatorId: null };
	const begun = await store.beginAnswer(input);
	if (!begun.ok) throw new Error(begun.reason);
	await store.markAnswerUnknown(begun.answer.id, "fetch failed");
	const state = await store.getConversation(zalo("unknown"));
	expect(state?.lastAnswer).toMatchObject({ status: "unknown", failureReason: "fetch failed" });
	// The vendor may have it: not Your turn, and not retried.
	expect(state?.unansweredInboundId).toBeNull();
	expect(await store.beginAnswer(input)).toEqual({ ok: false, reason: "unknown" });
	expect(state?.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
	await store.close();
});

test("your turn reads the Answers, not message order: a guest message mid-send stays open", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("mid", "M1"), OFFICE);
	const m1 = conv.unansweredInboundId!;
	const begun = await store.beginAnswer({
		conversationId: zalo("mid"),
		inboundId: m1,
		text: "reply to M1",
		operatorId: null,
	});
	if (!begun.ok) throw new Error(begun.reason);
	// M2 lands while M1's reply is with the vendor.
	const withM2 = await store.upsertInbound(inbound("mid", "M2"), OFFICE);
	const m2 = withM2.unansweredInboundId!;
	expect(m2).not.toBe(m1);
	// M1's reply is acknowledged and stored last on the thread.
	const done = await store.completeAnswer(begun.answer.id, mockSend("mid"));
	expect(done?.messages.map((m) => m.text)).toEqual(["M1", "M2", "reply to M1"]);
	expect(done?.unansweredInboundId).toBe(m2);
	// Answering M2 closes the thread's turn.
	const closed = await answer(store, zalo("mid"), m2, "reply to M2");
	expect(closed?.unansweredInboundId).toBeNull();
	expect(closed?.answers.map((a) => [a.inboundId, a.status])).toEqual([
		[m1, "sent"],
		[m2, "sent"],
	]);
	await store.close();
});

test("translations are stored per message per operator language and read back", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("tr", "안녕하세요"), OFFICE);
	const id = conv.messages[0].id;
	expect(conv.messages[0].translations).toEqual({});
	await store.setTranslation(id, "vi", "Xin chào");
	await store.setTranslation(id, "en", "Hello");
	await store.setTranslation(id, "en", "Hello there");
	const after = await store.getConversation(zalo("tr"));
	expect(after?.messages[0].translations).toEqual({ vi: "Xin chào", en: "Hello there" });
	await store.close();
});

test("the suggested reply records which guest message it answers and where it came from", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("draft", "Looking to rent in Tay Ho"), OFFICE);
	const inboundId = conv.unansweredInboundId!;
	const shot = await store.setOneShot(
		zalo("draft"),
		oneShot("Looking to rent in Tay Ho", inboundId),
	);
	expect(shot?.oneShot?.draft).toMatchObject({ answersMessageId: inboundId, source: "template" });
	const drafted = await store.setDraft(zalo("draft"), {
		reply: "Sure, which floor do you prefer?",
		answersMessageId: inboundId,
		source: "model",
	});
	expect(drafted?.oneShot?.draft).toEqual({
		reply: "Sure, which floor do you prefer?",
		answersMessageId: inboundId,
		source: "model",
	});
	expect(drafted?.oneShot?.qualification.areaOfInterest).toBe("Tây Hồ");
	expect(await store.setDraft(zalo("missing"), drafted!.oneShot!.draft)).toBeNull();
	await store.close();
});

test("deleting an office deletes its threads and pipe connections", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("gone"), OFFICE);
	await store.connectPipe({ pipe: "zalo", externalId: "oa-gone", officeId: OFFICE });
	await store.upsertInbound(inbound("stays"), OTHER_OFFICE);
	await testDb.organization.delete({ where: { id: OFFICE } });
	expect(await store.listConversations()).toHaveLength(1);
	expect(await store.officeForPipe("zalo", "oa-gone")).toBeNull();
	await store.close();
});
