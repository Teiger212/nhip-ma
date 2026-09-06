import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { createInboxStore } from "@repo/database/inbox";
import { expect, test } from "vitest";

// better-sqlite3 is a dependency of @repo/database, not of this app. Resolve it from there
// so this test can inspect the raw file without adding a native dependency to apps/saas.
type RawDatabase = {
	pragma: (sql: string, options?: { simple: boolean }) => unknown;
	prepare: (sql: string) => { all: () => unknown[]; run: (...args: unknown[]) => unknown };
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

const inbound = (guestId: string, ownerUserId: string | null = null) => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text: "Xin chào",
	vendorMessageId: null,
	ownerUserId,
});

test("store opens in WAL mode with a busy timeout and a Send unique index", async () => {
	const store = createInboxStore(tempDb());
	const sqlite = new Database(store.filePath);
	expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
	expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
	const indexes = sqlite.prepare(`PRAGMA index_list("Send")`).all() as Array<{
		name: string;
		unique: number;
	}>;
	expect(indexes.some((index) => index.name === "Send_conversationId_key" && index.unique)).toBe(
		true,
	);
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

test("claimSend is atomic and releaseSend only undoes an unrecorded claim", async () => {
	const store = createInboxStore(tempDb());
	await store.upsertInbound(inbound("claim"));
	expect(await store.claimSend("zalo:claim")).toBe(true);
	expect(await store.claimSend("zalo:claim")).toBe(false);
	await store.releaseSend("zalo:claim");
	expect((await store.getConversation("zalo:claim"))?.sentAt).toBeNull();
	expect(await store.claimSend("zalo:claim")).toBe(true);
	await store.recordApprovedSend("zalo:claim", "reply", {
		mock: true,
		pipe: "zalo",
		to: "claim",
		vendorMessageId: "mock-1",
	});
	await store.releaseSend("zalo:claim");
	expect((await store.getConversation("zalo:claim"))?.sentAt).toBeTruthy();
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
