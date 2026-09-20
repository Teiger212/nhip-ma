import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { conversationId, createInboxStore } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { oneShot } from "./draft";

// better-sqlite3 is a dependency of @repo/database, not of this app. Resolve it from there
// so this test can inspect the raw file without adding a native dependency to apps/saas.
type RawDatabase = {
	pragma: (sql: string, options?: { simple: boolean }) => unknown;
	prepare: (sql: string) => {
		all: () => unknown[];
		get: () => unknown;
		run: (...args: unknown[]) => unknown;
	};
	exec: (sql: string) => void;
	close: () => void;
};
const requireFromApp = createRequire(import.meta.url);
const requireFromDatabase = createRequire(requireFromApp.resolve("@repo/database/inbox"));
const Database = requireFromDatabase("better-sqlite3") as new (file: string) => RawDatabase;

function tempDb(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-store-"));
	return path.join(dir, "nhip.db");
}

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

/** Approve and deliver in one go: the happy path of an Answer (ADR 0011). */
async function answer(
	store: ReturnType<typeof createInboxStore>,
	conversationId: string,
	inboundId: string,
	text: string,
) {
	const begun = await store.beginAnswer({ conversationId, inboundId, text, operatorId: "agent-1" });
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	return store.completeAnswer(begun.answer.id, mockSend(conversationId.split(":").at(-1) ?? ""));
}

function indexNames(sqlite: RawDatabase, table: string): string[] {
	return (sqlite.prepare(`PRAGMA index_list("${table}")`).all() as Array<{ name: string }>).map(
		(index) => index.name,
	);
}

function columnNames(sqlite: RawDatabase, table: string): string[] {
	return (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(
		(column) => column.name,
	);
}

test("store opens in WAL mode with a busy timeout and one send per guest message", async () => {
	const store = createInboxStore(tempDb());
	const sqlite = new Database(store.filePath);
	expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
	expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
	const indexes = sqlite.prepare(`PRAGMA index_list("Answer")`).all() as Array<{
		name: string;
		unique: number;
	}>;
	expect(indexes.some((index) => index.name === "Answer_inboundId_key" && index.unique)).toBe(true);
	const tables = (
		sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{
			name: string;
		}>
	).map((table) => table.name);
	expect(tables).not.toContain("Send");
	expect(tables).not.toContain("Approval");
	sqlite.close();
	await store.close();
});

test("message ids are unique cuids, not COUNT(*)+1", async () => {
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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
	const store = createInboxStore(tempDb());
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

test("a file from before tenancy drops the person column; its threads wait for an office", async () => {
	const file = tempDb();
	const legacy = new Database(file);
	legacy.exec(`CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipe" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "ownerUserId" TEXT,
    "language" TEXT,
    "lastGuestInboundAt" DATETIME,
    "sentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
  )`);
	legacy.exec(
		`CREATE UNIQUE INDEX "Conversation_pipe_guestId_key" ON "Conversation"("pipe", "guestId")`,
	);
	const insert = legacy.prepare(
		`INSERT INTO "Conversation" ("id", "pipe", "guestId", "ownerUserId", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
	);
	insert.run("zalo:old", "zalo", "old", null, new Date().toISOString());
	insert.run("zalo:owned", "zalo", "owned", "some-user", new Date().toISOString());
	insert.run("zalo:taken", "zalo", "taken", null, new Date().toISOString());
	legacy.close();

	const store = createInboxStore(file);
	const sqlite = new Database(store.filePath);
	expect(columnNames(sqlite, "Conversation")).toContain("officeId");
	expect(columnNames(sqlite, "Conversation")).not.toContain("ownerUserId");
	expect(indexNames(sqlite, "Conversation")).toContain("Conversation_officeId_pipe_guestId_key");
	expect(indexNames(sqlite, "Conversation")).not.toContain("Conversation_pipe_guestId_key");
	sqlite.close();

	// A user id was never an office id: the threads are unowned and invisible to any viewer.
	const viewer = { userId: "anyone", officeId: OFFICE };
	expect((await store.getConversation("zalo:old"))?.officeId).toBeNull();
	expect((await store.getConversation("zalo:owned"))?.officeId).toBeNull();
	expect(await store.listConversations(viewer)).toEqual([]);

	// The guest "taken" already has a thread in office A, so that legacy thread cannot be
	// adopted without merging histories; it stays unowned and the other two are adopted.
	await store.upsertInbound(inbound("taken", "fresh"), OFFICE);
	expect(await store.adoptUnownedThreads(OFFICE)).toBe(2);
	expect((await store.listConversations(viewer)).map((c) => c.guestId).sort()).toEqual([
		"old",
		"owned",
		"taken",
	]);
	expect((await store.getConversation("zalo:taken"))?.officeId).toBeNull();
	// An office with no thread for that guest may still adopt it; then nothing is left.
	expect(await store.adoptUnownedThreads(OTHER_OFFICE)).toBe(1);
	expect((await store.getConversation("zalo:taken"))?.officeId).toBe(OTHER_OFFICE);
	expect(await store.adoptUnownedThreads(OTHER_OFFICE)).toBe(0);

	// An adopted legacy thread keeps its old id and receives the guest's next message.
	const next = await store.upsertInbound(inbound("old", "still here"), OFFICE);
	expect(next.id).toBe("zalo:old");
	expect(next.messages.map((m) => m.text)).toEqual(["still here"]);
	await store.close();
});

test("a file from before the Answer folds its sends into Answers and learns what they answered", async () => {
	const file = tempDb();
	const legacy = new Database(file);
	legacy.exec(`CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipe" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "ownerUserId" TEXT,
    "language" TEXT,
    "lastGuestInboundAt" DATETIME,
    "sentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
  )`);
	legacy.exec(`CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "vendorMessageId" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT 0
  )`);
	legacy.exec(
		`CREATE TABLE "Draft" ("conversationId" TEXT NOT NULL PRIMARY KEY, "reply" TEXT NOT NULL)`,
	);
	legacy.exec(`CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "at" DATETIME NOT NULL
  )`);
	legacy.exec(`CREATE TABLE "Send" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "mock" BOOLEAN NOT NULL,
    "pipe" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "text" TEXT,
    "vendorMessageId" TEXT,
    "at" DATETIME NOT NULL
  )`);
	legacy.exec(`CREATE UNIQUE INDEX "Send_conversationId_key" ON "Send"("conversationId")`);
	const t0 = "2026-09-01T10:00:00.000Z";
	const t1 = "2026-09-01T11:00:00.000Z";
	const t2 = "2026-09-02T09:00:00.000Z";
	legacy
		.prepare(
			`INSERT INTO "Conversation" ("id", "pipe", "guestId", "lastGuestInboundAt", "sentAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.run("zalo:legacy", "zalo", "legacy", t2, t1, t2);
	const insertMessage = legacy.prepare(
		`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at") VALUES (?, ?, ?, ?, ?, ?)`,
	);
	insertMessage.run("m-in-1", "zalo:legacy", "in", "guest", "hello", t0);
	insertMessage.run("m-out-1", "zalo:legacy", "out", "nhip", "hi there", t1);
	insertMessage.run("m-in-2", "zalo:legacy", "in", "guest", "still there?", t2);
	legacy
		.prepare(`INSERT INTO "Draft" ("conversationId", "reply") VALUES (?, ?)`)
		.run("zalo:legacy", "hi there");
	legacy
		.prepare(`INSERT INTO "Approval" ("id", "conversationId", "reply", "at") VALUES (?, ?, ?, ?)`)
		.run("a-1", "zalo:legacy", "hi there", t1);
	legacy
		.prepare(
			`INSERT INTO "Send" ("id", "conversationId", "mock", "pipe", "to", "text", "at") VALUES (?, ?, 1, 'zalo', 'legacy', 'hi there', ?)`,
		)
		.run("s-1", "zalo:legacy", t1);
	legacy.close();

	const store = createInboxStore(file);
	const sqlite = new Database(store.filePath);
	const tables = (
		sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{
			name: string;
		}>
	).map((table) => table.name);
	expect(tables).toContain("Answer");
	expect(tables).not.toContain("Send");
	expect(tables).not.toContain("Approval");
	expect(columnNames(sqlite, "Message")).not.toContain("claimedAt");
	sqlite.close();

	// The old send is a sent Answer to the last inbound before it, with the approved text.
	const conv = await store.getConversation("zalo:legacy");
	expect(conv?.answers).toHaveLength(1);
	expect(conv?.lastAnswer).toMatchObject({
		id: "s-1",
		inboundId: "m-in-1",
		text: "hi there",
		status: "sent",
		mock: true,
		pipe: "zalo",
		to: "legacy",
		operatorId: null,
		approvedAt: t1,
		sentAt: t1,
	});
	// The guest who wrote back after that old send is Your turn, which the old rule forbade.
	expect(conv?.unansweredInboundId).toBe("m-in-2");
	expect(conv?.sentAt).toBe(t1);
	expect(conv?.officeId).toBeNull();
	expect(conv?.messages.map((message) => message.pipeExternalId)).toEqual([null, null, null]);
	expect(conv?.messages.map((message) => message.translations)).toEqual([{}, {}, {}]);
	// And it can be answered.
	const begun = await store.beginAnswer({
		conversationId: "zalo:legacy",
		inboundId: "m-in-2",
		text: "still here",
		operatorId: null,
	});
	expect(begun.ok).toBe(true);
	// Reopening the file is a no-op: nothing to fold twice.
	await store.close();
	const reopened = createInboxStore(file);
	expect((await reopened.getConversation("zalo:legacy"))?.answers).toHaveLength(2);
	await reopened.close();
});
