import { backfillAnswerOperatorNames } from "@repo/database";
import { expect, test } from "vitest";

import { oneShot } from "./draft";
import { deleteThreadUnder, testDb, testInboxStore } from "./test-store";

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
/** A vendor message id as stored: an HMAC-SHA256, hex. */
const HASHED = expect.stringMatching(/^[0-9a-f]{64}$/);
/** The id of a guest's Zalo thread at an office, found as the store finds it: by (office, pipe, guest). */
async function threadId(officeId: string, guestId: string): Promise<string> {
	const thread = await testDb.conversation.findUniqueOrThrow({
		where: { officeId_pipe_guestId: { officeId, pipe: "zalo", guestId } },
		select: { id: true },
	});
	return thread.id;
}
/** The id of a guest's Zalo thread in office A. */
const zalo = (guestId: string) => threadId(OFFICE, guestId);

const inbound = (guestId: string, text = "Xin chào", pipeExternalId: string | null = null) => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text,
	vendorMessageId: null,
	pipeExternalId,
});

let sends = 0;
/** Vendor ids are unique per message, as a real vendor's are. */
const mockSend = (guest: string) => ({
	mock: true,
	pipe: "zalo" as const,
	vendorMessageId: `mock-${guest}-${++sends}`,
});

type Store = Awaited<ReturnType<typeof testInboxStore>>;

/** Approve and deliver in one go: the happy path of an Answer (ADR 0011). */
async function answer(store: Store, conversationId: string, inboundId: string, text: string) {
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId,
		inboundId,
		text,
		operatorId: "agent-1",
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	return store.completeAnswer(OFFICE, begun.answer.id, mockSend("guest"));
}

test("one Answer per guest message: two approvals in the same instant let one in", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("race"), OFFICE)).conversation;
	const inboundId = conv.unansweredInboundId!;
	const input = {
		officeId: OFFICE,
		conversationId: await zalo("race"),
		inboundId,
		text: "reply",
		operatorId: "agent-1",
	};
	const [first, second] = await Promise.all([store.beginAnswer(input), store.beginAnswer(input)]);
	const outcomes = [first, second].map((r) => (r.ok ? "ok" : r.reason)).sort();
	expect(outcomes).toEqual(["in_progress", "ok"]);
	expect(await testDb.answer.count({ where: { inboundId } })).toBe(1);
	await store.close();
});

test("message ids are unique cuids, not COUNT(*)+1", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const conv = (await store.upsertInbound(inbound("g1"), OFFICE)).conversation;
	expect(conv.messages).toHaveLength(2);
	const ids = new Set(conv.messages.map((message) => message.id));
	expect(ids.size).toBe(2);
	for (const id of ids) {
		expect(id).not.toMatch(/^zalo:g1:\d+$/);
	}
	await store.close();
});

test("threads belong to one office, are shared by its managers and invisible outside it", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("ours"), OFFICE);
	await store.upsertInbound(inbound("theirs"), OTHER_OFFICE);

	const managerA = { userId: "agent-1", officeId: OFFICE, role: "manager" as const };
	const managerA2 = { userId: "agent-2", officeId: OFFICE, role: "manager" as const };
	const managerB = { userId: "agent-3", officeId: OTHER_OFFICE, role: "manager" as const };
	const theirs = await threadId(OTHER_OFFICE, "theirs");

	// Any manager of the office sees its threads (ADR 0022); nobody sees another office's.
	expect((await store.listConversations(managerA)).map((c) => c.guestId)).toEqual(["ours"]);
	expect((await store.listConversations(managerA2)).map((c) => c.guestId)).toEqual(["ours"]);
	expect((await store.listConversations(managerB)).map((c) => c.guestId)).toEqual(["theirs"]);
	expect(await store.getConversation(theirs, managerA)).toBeNull();
	expect((await store.getConversation(theirs, managerB))?.officeId).toBe(OTHER_OFFICE);

	await store.close();
});

test("one thread per guest per office: the same guest at two offices never merges", async () => {
	const store = await testInboxStore();
	const atA = (await store.upsertInbound(inbound("same-guest", "private A"), OFFICE)).conversation;
	const atB = (await store.upsertInbound(inbound("same-guest", "private B"), OTHER_OFFICE))
		.conversation;
	expect(atA.id).toBe(await zalo("same-guest"));
	expect(atB.id).toBe(await threadId(OTHER_OFFICE, "same-guest"));
	expect(atA.id).not.toBe(atB.id);
	expect(atA.messages.map((m) => m.text)).toEqual(["private A"]);
	expect(atB.messages.map((m) => m.text)).toEqual(["private B"]);
	// A follow-up at A lands in A's thread only.
	const again = (await store.upsertInbound(inbound("same-guest", "again A"), OFFICE)).conversation;
	expect(again.id).toBe(atA.id);
	expect(again.messages.map((m) => m.text)).toEqual(["private A", "again A"]);
	expect((await store.getOfficeConversation(atB.officeId, atB.id))?.messages).toHaveLength(1);
	await store.close();
});

test("each message remembers the office endpoint it travelled through", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("ep", "hi", "oa-1"), OFFICE)).conversation;
	expect(conv.messages[0].pipeExternalId).toBe("oa-1");
	const sent = await answer(store, conv.id, conv.messages[0].id, "hello");
	// The reply went out on the endpoint the guest wrote to.
	expect(sent?.messages[1]).toMatchObject({ source: "nhip", pipeExternalId: "oa-1" });
	// A dev injection has no endpoint, and that is allowed.
	const dev = (await store.upsertInbound(inbound("ep", "again"), OFFICE)).conversation;
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
	const fresh = (await store.upsertInbound(inbound("turn"), OFFICE)).conversation;
	const firstInbound = fresh.messages[0].id;
	expect(fresh.unansweredInboundId).toBe(firstInbound);

	// Two guest messages in a row: the latest is the one to answer.
	const burst = (await store.upsertInbound(inbound("turn", "and one more thing"), OFFICE))
		.conversation;
	const secondInbound = burst.messages[1].id;
	expect(burst.unansweredInboundId).toBe(secondInbound);

	const sent = await answer(store, await zalo("turn"), secondInbound, "reply");
	expect(sent?.unansweredInboundId).toBeNull();
	expect(sent?.sentAt).toBeTruthy();

	// The guest writes back: Your turn again, and sentAt is no longer terminal.
	const back = (await store.upsertInbound(inbound("turn", "thanks, one question"), OFFICE))
		.conversation;
	expect(back.unansweredInboundId).toBe(back.messages[3].id);
	expect(back.sentAt).toBe(sent?.sentAt);

	// An agent answering from the OA app directly also ends the guest's turn.
	const echoed = (
		await store.upsertInbound(
			{ ...inbound("turn", "answered from the OA app"), source: "oa-echo" },
			OFFICE,
		)
	).conversation;
	expect(echoed.unansweredInboundId).toBeNull();
	await store.close();
});

test("an Answer is on record from approval and carries the send's lifecycle", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("life", "hi", "oa-1"), OFFICE)).conversation;
	const inboundId = conv.unansweredInboundId!;
	const input = {
		officeId: OFFICE,
		conversationId: await zalo("life"),
		inboundId,
		text: "reply",
		operatorId: "agent-1",
	};

	// Approval writes the row before any vendor call, and the guest's turn is over already.
	const begun = await store.beginAnswer(input);
	if (!begun.ok) throw new Error(begun.reason);
	expect(begun.answer).toMatchObject({
		inboundId,
		text: "reply",
		operatorId: "agent-1",
		status: "sending",
		pipe: "zalo",
		pipeExternalId: "oa-1",
		sentAt: null,
	});
	expect(
		(await store.getOfficeConversation(OFFICE, await zalo("life")))?.unansweredInboundId,
	).toBeNull();
	expect((await store.getOfficeConversation(OFFICE, await zalo("life")))?.messages).toHaveLength(1);

	// A second approval while the first is in flight is refused.
	expect(await store.beginAnswer(input)).toEqual({ ok: false, reason: "in_progress" });

	// The vendor refused: failed, the guest's turn is back, and the retry reuses the row.
	await store.failAnswer(OFFICE, begun.answer.id, "token expired");
	let state = await store.getOfficeConversation(OFFICE, await zalo("life"));
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
	const done = await store.completeAnswer(OFFICE, retried.answer.id, {
		mock: false,
		pipe: "zalo",
		vendorMessageId: "z-1",
	});
	// The vendor's id is kept keyed and hashed, never as the vendor wrote it (#141).
	expect(done?.lastAnswer).toMatchObject({ status: "sent", vendorMessageId: HASHED, mock: false });
	expect(done?.lastAnswer?.sentAt).toBeTruthy();
	expect(done?.sentAt).toBe(done?.lastAnswer?.sentAt);
	expect(done?.messages.at(-1)).toMatchObject({
		source: "nhip",
		text: "second try",
		pipeExternalId: "oa-1",
		vendorMessageId: done?.lastAnswer?.vendorMessageId,
	});
	expect(done?.answers).toHaveLength(1);

	// Once sent, the same guest message cannot be answered again, by any path.
	expect(await store.beginAnswer(input)).toEqual({ ok: false, reason: "already_answered" });
	await expect(store.completeAnswer(OFFICE, retried.answer.id, mockSend("life"))).rejects.toThrow(
		/sent/,
	);
	// Failing or marking a sent Answer is a no-op.
	await store.failAnswer(OFFICE, retried.answer.id, "late");
	await store.markAnswerUnknown(OFFICE, retried.answer.id, "late");
	expect((await store.getOfficeConversation(OFFICE, await zalo("life")))?.lastAnswer?.status).toBe(
		"sent",
	);
	// Only a guest message can be answered.
	const outbound = done!.messages.find((message) => message.direction === "out")!;
	await expect(store.beginAnswer({ ...input, inboundId: outbound.id })).rejects.toThrow(
		/guest message/,
	);
	await store.close();
});

test("an Answer of unknown outcome blocks every further approval of that message", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("unknown"), OFFICE)).conversation;
	const inboundId = conv.unansweredInboundId!;
	const input = {
		officeId: OFFICE,
		conversationId: await zalo("unknown"),
		inboundId,
		text: "reply",
		operatorId: null,
	};
	const begun = await store.beginAnswer(input);
	if (!begun.ok) throw new Error(begun.reason);
	await store.markAnswerUnknown(OFFICE, begun.answer.id, "fetch failed");
	const state = await store.getOfficeConversation(OFFICE, await zalo("unknown"));
	expect(state?.lastAnswer).toMatchObject({ status: "unknown", failureReason: "fetch failed" });
	// The vendor may have it: not Your turn, and not retried.
	expect(state?.unansweredInboundId).toBeNull();
	expect(await store.beginAnswer(input)).toEqual({ ok: false, reason: "unknown" });
	expect(state?.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
	await store.close();
});

test("your turn reads the Answers, not message order: a guest message mid-send stays open", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("mid", "M1"), OFFICE)).conversation;
	const m1 = conv.unansweredInboundId!;
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId: await zalo("mid"),
		inboundId: m1,
		text: "reply to M1",
		operatorId: null,
	});
	if (!begun.ok) throw new Error(begun.reason);
	// M2 lands while M1's reply is with the vendor.
	const withM2 = (await store.upsertInbound(inbound("mid", "M2"), OFFICE)).conversation;
	const m2 = withM2.unansweredInboundId!;
	expect(m2).not.toBe(m1);
	// M1's reply is acknowledged and stored last on the thread.
	const done = await store.completeAnswer(OFFICE, begun.answer.id, mockSend("mid"));
	expect(done?.messages.map((m) => m.text)).toEqual(["M1", "M2", "reply to M1"]);
	expect(done?.unansweredInboundId).toBe(m2);
	// Answering M2 closes the thread's turn.
	const closed = await answer(store, await zalo("mid"), m2, "reply to M2");
	expect(closed?.unansweredInboundId).toBeNull();
	expect(closed?.answers.map((a) => [a.inboundId, a.status])).toEqual([
		[m1, "sent"],
		[m2, "sent"],
	]);
	await store.close();
});

test("translations are stored per message per operator language and read back", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("tr", "안녕하세요"), OFFICE)).conversation;
	const id = conv.messages[0].id;
	expect(conv.messages[0].translations).toEqual({});
	await store.setTranslation(OFFICE, id, "vi", "Xin chào");
	await store.setTranslation(OFFICE, id, "en", "Hello");
	await store.setTranslation(OFFICE, id, "en", "Hello there");
	const after = await store.getOfficeConversation(OFFICE, await zalo("tr"));
	expect(after?.messages[0].translations).toEqual({ vi: "Xin chào", en: "Hello there" });
	await store.close();
});

test("the suggested reply records which guest message it answers and where it came from", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("draft", "Looking to rent in Tay Ho"), OFFICE))
		.conversation;
	const inboundId = conv.unansweredInboundId!;
	const shot = await store.setOneShot(
		OFFICE,
		await zalo("draft"),
		oneShot("Looking to rent in Tay Ho", inboundId),
	);
	expect(shot?.oneShot?.draft).toMatchObject({ answersMessageId: inboundId, source: "template" });
	const drafted = await store.setDraft(OFFICE, await zalo("draft"), {
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
	expect(await store.setDraft(OFFICE, "no-such-thread", drafted!.oneShot!.draft)).toBeNull();
	await store.close();
});

test("deleting an office deletes its threads and pipe connections", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("gone"), OFFICE);
	await store.connectPipe({ pipe: "zalo", externalId: "oa-gone", officeId: OFFICE });
	await store.upsertInbound(inbound("stays"), OTHER_OFFICE);
	await testDb.organization.delete({ where: { id: OFFICE } });
	expect(await testDb.conversation.count()).toBe(1);
	expect(await store.officeForPipe("zalo", "oa-gone")).toBeNull();
	await store.close();
});

test("an Answer keeps its sender's name after the account is deleted (ADR 0013)", async () => {
	const store = await testInboxStore();
	const now = new Date();
	await testDb.user.deleteMany({ where: { id: "leaver" } });
	await testDb.user.create({
		data: {
			id: "leaver",
			name: "Lan",
			email: "lan@test.nhip.local",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		},
	});
	const conv = (await store.upsertInbound(inbound("price"), OFFICE)).conversation;
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId: await zalo("price"),
		inboundId: conv.unansweredInboundId!,
		text: "The price is 2,000 USD a month.",
		operatorId: "leaver",
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	expect(begun.answer.operatorName).toBe("Lan");
	await testDb.user.delete({ where: { id: "leaver" } });
	const kept = await testDb.answer.findUniqueOrThrow({ where: { id: begun.answer.id } });
	expect(kept).toMatchObject({ operatorId: null, operatorName: "Lan" });
	await store.close();
});

test("Answers approved before ADR 0013 get their sender's name filled in", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("old"), OFFICE)).conversation;
	await answer(store, await zalo("old"), conv.unansweredInboundId!, "reply");
	await testDb.answer.updateMany({ data: { operatorName: null } });
	expect(await backfillAnswerOperatorNames(testDb)).toBe(1);
	expect(await backfillAnswerOperatorNames(testDb)).toBe(0);
	const filled = await testDb.answer.findFirstOrThrow();
	expect(filled.operatorName).toBe("agent-1");
	await store.close();
});

test("two approvals racing the retry of a failed Answer let one in", async () => {
	const store = await testInboxStore();
	const conv = (await store.upsertInbound(inbound("retry-race"), OFFICE)).conversation;
	const inboundId = conv.unansweredInboundId!;
	const input = {
		officeId: OFFICE,
		conversationId: await zalo("retry-race"),
		inboundId,
		text: "reply",
		operatorId: "agent-1",
	};
	const begun = await store.beginAnswer(input);
	if (!begun.ok) throw new Error(begun.reason);
	await store.failAnswer(OFFICE, begun.answer.id, "token expired");
	const [first, second] = await Promise.all([
		store.beginAnswer({ ...input, operatorId: "agent-1" }),
		store.beginAnswer({ ...input, operatorId: "agent-2" }),
	]);
	const outcomes = [first, second].map((r) => (r.ok ? "ok" : r.reason)).sort();
	expect(outcomes).toEqual(["in_progress", "ok"]);
	expect(await testDb.answer.count({ where: { inboundId } })).toBe(1);
	await store.close();
});

// Guest deletion (ADR 0020, "How it is built"): approve locks the conversation before it reads
// or writes an Answer, the order the delete locks in, so an approval of a deleted thread is
// `not_found`: never a 500, never a deadlock (40P01), never a reply on a thread that is gone.
const NOT_FOUND = { ok: false, reason: "not_found" };

/** A guest's thread in office A, and the approval of its unanswered message. */
async function approvable(store: Store, guestId: string, operatorId: string | null = "agent-1") {
	const { conversation: conv } = await store.upsertInbound(inbound(guestId), OFFICE);
	const input = {
		officeId: OFFICE,
		conversationId: conv.id,
		inboundId: conv.unansweredInboundId!,
		text: "reply",
		operatorId,
	};
	return { conv, input };
}

/** The thread's first approval failed at the vendor, so the next one is a retry. */
async function failedOnce(store: Store, input: Parameters<Store["beginAnswer"]>[0]) {
	const begun = await store.beginAnswer(input);
	if (!begun.ok) throw new Error(begun.reason);
	await store.failAnswer(OFFICE, begun.answer.id, "token expired");
}

test("approving a thread already deleted is not_found, on a first send and on a retry (ADR 0020)", async () => {
	const store = await testInboxStore();
	const fresh = await approvable(store, "gone-first");
	const retried = await approvable(store, "gone-retry");
	await failedOnce(store, retried.input);
	expect(await store.deleteConversations(OFFICE, [fresh.conv.id, retried.conv.id])).toBe(2);
	expect(await store.beginAnswer(fresh.input)).toEqual(NOT_FOUND);
	expect(await store.beginAnswer({ ...retried.input, text: "second try" })).toEqual(NOT_FOUND);
	await store.close();
});

test("a delete committed under the first approval of an Unassigned thread makes it not_found (ADR 0020)", async () => {
	const store = await testInboxStore();
	const { conv, input } = await approvable(store, "under-first");
	expect(conv.owner).toBeNull();
	const approved = await deleteThreadUnder(OFFICE, conv.id, () => store.beginAnswer(input));
	expect(approved).toEqual(NOT_FOUND);
	expect(await testDb.conversation.count({ where: { id: conv.id } })).toBe(0);
	await store.close();
});

test("a delete committed under the retry of a failed Answer makes it not_found (ADR 0020)", async () => {
	const store = await testInboxStore();
	// The failed first approval claimed the thread: it has an owner.
	const { conv, input } = await approvable(store, "under-retry", "agent-1");
	await failedOnce(store, input);
	const approved = await deleteThreadUnder(OFFICE, conv.id, () =>
		store.beginAnswer({ ...input, text: "second try" }),
	);
	expect(approved).toEqual(NOT_FOUND);
	await store.close();
});

test("a delete committed under the retry on an Unassigned thread is not_found, not a deadlock (ADR 0020)", async () => {
	const store = await testInboxStore();
	// The failed first approval had no operator, so the thread is still Unassigned and the
	// retry's approval claims it: approve then writes the Answer and the conversation.
	const { conv, input } = await approvable(store, "under-unassigned-retry", null);
	await failedOnce(store, input);
	expect((await store.getOfficeConversation(OFFICE, conv.id))?.owner).toBeNull();
	const approved = await deleteThreadUnder(OFFICE, conv.id, () =>
		store.beginAnswer({ ...input, text: "second try", operatorId: "agent-2" }),
	);
	expect(approved).toEqual(NOT_FOUND);
	expect(await testDb.conversation.count({ where: { id: conv.id } })).toBe(0);
	await store.close();
});

test("a vendor retry of one message is stored once, even when both land at the same time", async () => {
	const store = await testInboxStore();
	const event = { ...inbound("retried"), vendorMessageId: "vendor-m1" };
	await Promise.all([store.upsertInbound(event, OFFICE), store.upsertInbound(event, OFFICE)]);
	const conv = await store.getOfficeConversation(OFFICE, await zalo("retried"));
	expect(conv?.messages).toHaveLength(1);
	await store.close();
});

test("the store says whether an inbound was new: a vendor retry is not (ADR 0019)", async () => {
	const store = await testInboxStore();
	const event = { ...inbound("said"), vendorMessageId: "vendor-said-1" };
	const first = await store.upsertInbound(event, OFFICE);
	const retry = await store.upsertInbound(event, OFFICE);
	const next = await store.upsertInbound({ ...event, vendorMessageId: "vendor-said-2" }, OFFICE);
	const noId = await store.upsertInbound(inbound("said"), OFFICE);
	expect([first.inserted, retry.inserted, next.inserted, noId.inserted]).toEqual([
		true,
		false,
		true,
		true,
	]);
	expect(retry.conversation.id).toBe(first.conversation.id);
	expect(retry.conversation.messages).toHaveLength(1);
	await store.close();
});

test("a vendor retry landing at the same time as the message: only one of them is new", async () => {
	const store = await testInboxStore();
	const event = { ...inbound("raced"), vendorMessageId: "vendor-raced-1" };
	const results = await Promise.all(
		Array.from({ length: 4 }, () => store.upsertInbound(event, OFFICE)),
	);
	expect(results.filter((result) => result.inserted)).toHaveLength(1);
	await store.close();
});

test("a new guest's first two messages at the same time make one thread", async () => {
	const store = await testInboxStore();
	await Promise.all([
		store.upsertInbound({ ...inbound("twin", "one"), vendorMessageId: "v-1" }, OFFICE),
		store.upsertInbound({ ...inbound("twin", "two"), vendorMessageId: "v-2" }, OFFICE),
	]);
	const conv = await store.getOfficeConversation(OFFICE, await zalo("twin"));
	expect(conv?.messages.map((message) => message.text).sort()).toEqual(["one", "two"]);
	await store.close();
});
