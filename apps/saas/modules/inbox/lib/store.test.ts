import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { createInboxStore } from "@repo/database/inbox";
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

const inbound = (guestId: string, ownerUserId: string | null = null, text = "Xin chào") => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text,
	vendorMessageId: null,
	ownerUserId,
});

const mockSend = (to: string) => ({
	mock: true,
	pipe: "zalo" as const,
	to,
	vendorMessageId: `mock-${to}`,
});

function indexNames(sqlite: RawDatabase, table: string): string[] {
	return (sqlite.prepare(`PRAGMA index_list("${table}")`).all() as Array<{ name: string }>).map(
		(index) => index.name,
	);
}

test("store opens in WAL mode with a busy timeout and one send per guest message", async () => {
	const store = createInboxStore(tempDb());
	const sqlite = new Database(store.filePath);
	expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
	expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
	const indexes = sqlite.prepare(`PRAGMA index_list("Send")`).all() as Array<{
		name: string;
		unique: number;
	}>;
	expect(indexes.some((index) => index.name === "Send_answersMessageId_key" && index.unique)).toBe(
		true,
	);
	expect(indexes.some((index) => index.name === "Send_conversationId_key")).toBe(false);
	sqlite.close();
	await store.close();
});

test("message ids are unique cuids, not COUNT(*)+1", async () => {
	const store = createInboxStore(tempDb());
	await store.upsertInbound(inbound("g1"));
	const conv = await store.upsertInbound(inbound("g1"));
	expect(conv.messages).toHaveLength(2);
	const ids = new Set(conv.messages.map((message) => message.id));
	expect(ids.size).toBe(2);
	for (const id of ids) {
		expect(id).not.toMatch(/^zalo:g1:\d+$/);
	}
	await store.close();
});

test("threads are scoped to their owner; unowned threads stay visible to everyone", async () => {
	const store = createInboxStore(tempDb());
	await store.upsertInbound(inbound("shared"));
	await store.upsertInbound(inbound("mine", "user-a"));
	await store.upsertInbound(inbound("theirs", "user-b"));

	const forA = await store.listConversations({ userId: "user-a" });
	expect(forA.map((conversation) => conversation.guestId).sort()).toEqual(["mine", "shared"]);

	expect(await store.getConversation("zalo:theirs", { userId: "user-a" })).toBeNull();
	expect((await store.getConversation("zalo:theirs", { userId: "user-b" }))?.guestId).toBe(
		"theirs",
	);
	expect((await store.getConversation("zalo:shared", { userId: "user-a" }))?.guestId).toBe(
		"shared",
	);

	// Scripts and tests without a viewer still see everything.
	expect(await store.listConversations()).toHaveLength(3);

	// A later inbound with an owner adopts an unowned thread but never reassigns an owned one.
	await store.upsertInbound(inbound("shared", "user-a"));
	await store.upsertInbound(inbound("theirs", "user-a"));
	expect((await store.getConversation("zalo:shared"))?.ownerUserId).toBe("user-a");
	expect((await store.getConversation("zalo:theirs"))?.ownerUserId).toBe("user-b");
	await store.close();
});

test("your turn is derived from the messages: the guest spoke last and nothing answers it", async () => {
	const store = createInboxStore(tempDb());
	const fresh = await store.upsertInbound(inbound("turn"));
	const firstInbound = fresh.messages[0].id;
	expect(fresh.unansweredInboundId).toBe(firstInbound);

	// Two guest messages in a row: the latest is the one to answer.
	const burst = await store.upsertInbound(inbound("turn", null, "and one more thing"));
	const secondInbound = burst.messages[1].id;
	expect(burst.unansweredInboundId).toBe(secondInbound);

	const sent = await store.recordApprovedSend(
		"zalo:turn",
		"reply",
		mockSend("turn"),
		secondInbound,
	);
	expect(sent?.unansweredInboundId).toBeNull();
	expect(sent?.sentAt).toBeTruthy();

	// The guest writes back: Your turn again, and sentAt is no longer terminal.
	const back = await store.upsertInbound(inbound("turn", null, "thanks, one question"));
	expect(back.unansweredInboundId).toBe(back.messages[3].id);
	expect(back.sentAt).toBe(sent?.sentAt);

	// An agent answering from the OA app directly also ends the guest's turn.
	const echoed = await store.upsertInbound({
		...inbound("turn", null, "answered from the OA app"),
		source: "oa-echo",
	});
	expect(echoed.unansweredInboundId).toBeNull();
	await store.close();
});

test("claimSend is atomic per guest message and releaseSend only undoes an unrecorded claim", async () => {
	const store = createInboxStore(tempDb());
	const conv = await store.upsertInbound(inbound("claim"));
	const inboundId = conv.unansweredInboundId;
	if (!inboundId) throw new Error("expected an unanswered inbound");
	expect(await store.claimSend(inboundId)).toBe(true);
	expect(await store.claimSend(inboundId)).toBe(false);
	await store.releaseSend(inboundId);
	expect(await store.claimSend(inboundId)).toBe(true);
	await store.recordApprovedSend("zalo:claim", "reply", mockSend("claim"), inboundId);
	await store.releaseSend(inboundId);
	expect(await store.claimSend(inboundId)).toBe(false);
	// An office message can never be claimed.
	const after = await store.getConversation("zalo:claim");
	const outbound = after?.messages.find((message) => message.direction === "out");
	expect(outbound).toBeTruthy();
	expect(await store.claimSend(outbound!.id)).toBe(false);
	await store.close();
});

test("a second Send answering the same guest message is refused by the file itself", async () => {
	const store = createInboxStore(tempDb());
	const conv = await store.upsertInbound(inbound("twice"));
	const inboundId = conv.unansweredInboundId!;
	await store.recordApprovedSend("zalo:twice", "one", mockSend("twice"), inboundId);
	await expect(
		store.recordApprovedSend("zalo:twice", "two", mockSend("twice"), inboundId),
	).rejects.toThrow(/UNIQUE/);
	const after = await store.getConversation("zalo:twice");
	expect(after?.messages.filter((message) => message.source === "nhip")).toHaveLength(1);
	await store.close();
});

test("translations are stored per message per operator language and read back", async () => {
	const store = createInboxStore(tempDb());
	const conv = await store.upsertInbound(inbound("tr", null, "안녕하세요"));
	const id = conv.messages[0].id;
	expect(conv.messages[0].translations).toEqual({});
	await store.setTranslation(id, "vi", "Xin chào");
	await store.setTranslation(id, "en", "Hello");
	await store.setTranslation(id, "en", "Hello there");
	const after = await store.getConversation("zalo:tr");
	expect(after?.messages[0].translations).toEqual({ vi: "Xin chào", en: "Hello there" });
	await store.close();
});

test("the suggested reply records which guest message it answers and where it came from", async () => {
	const store = createInboxStore(tempDb());
	const conv = await store.upsertInbound(inbound("draft", null, "Looking to rent in Tay Ho"));
	const inboundId = conv.unansweredInboundId!;
	const shot = await store.setOneShot(
		"zalo:draft",
		oneShot("Looking to rent in Tay Ho", inboundId),
	);
	expect(shot?.oneShot?.draft).toMatchObject({ answersMessageId: inboundId, source: "template" });
	const drafted = await store.setDraft("zalo:draft", {
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
	expect(await store.setDraft("zalo:missing", drafted!.oneShot!.draft)).toBeNull();
	await store.close();
});

test("an older file without ownerUserId is migrated on open", async () => {
	const file = tempDb();
	const legacy = new Database(file);
	legacy.exec(`CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipe" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "language" TEXT,
    "lastGuestInboundAt" DATETIME,
    "sentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
  )`);
	legacy
		.prepare(
			`INSERT INTO "Conversation" ("id", "pipe", "guestId", "updatedAt") VALUES (?, ?, ?, ?)`,
		)
		.run("zalo:old", "zalo", "old", new Date().toISOString());
	legacy.close();

	const store = createInboxStore(file);
	const conv = await store.getConversation("zalo:old", { userId: "anyone" });
	expect(conv?.ownerUserId).toBeNull();
	expect(conv?.guestId).toBe("old");
	await store.close();
});

test("a file from before reply-only is migrated: sends learn which message they answered", async () => {
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
	const send = sqlite.prepare(`SELECT "answersMessageId" FROM "Send" WHERE "id" = 's-1'`).get() as {
		answersMessageId: string | null;
	};
	expect(send.answersMessageId).toBe("m-in-1");
	const approval = sqlite
		.prepare(`SELECT "answersMessageId" FROM "Approval" WHERE "id" = 'a-1'`)
		.get() as { answersMessageId: string | null };
	expect(approval.answersMessageId).toBe("m-in-1");
	expect(indexNames(sqlite, "Send")).toContain("Send_answersMessageId_key");
	expect(indexNames(sqlite, "Send")).not.toContain("Send_conversationId_key");
	sqlite.close();

	// The guest who wrote back after that old send is Your turn, which the old rule forbade.
	const conv = await store.getConversation("zalo:legacy");
	expect(conv?.unansweredInboundId).toBe("m-in-2");
	expect(conv?.sentAt).toBe(t1);
	expect(conv?.messages.map((message) => message.translations)).toEqual([{}, {}, {}]);
	expect(await store.claimSend("m-in-2")).toBe(true);
	await store.close();
});
