import { expect, test } from "vitest";

import { testDb, testInboxStore } from "../test-store";
import type { Store } from "../types";
import { alertSounds } from "./burst";
import { alertLink } from "./content";

/**
 * The alert log against the test database (ADR 0019 "Bursts", spec #84 testing seam 3): the
 * burst decision and the insert run in one transaction under an advisory lock on (operator,
 * thread), so alerts decided at the same moment leave exactly one sounding row.
 */
const OFFICE = "office-a";
const MINUTE = 60 * 1000;
const at = new Date("2026-10-05T09:00:00.000Z");

async function thread(store: Store, guestId: string): Promise<string> {
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId,
			guestName: null,
			text: "Xin chào",
			vendorMessageId: null,
		},
		OFFICE,
	);
	return conversation.id;
}

function guestAlert(store: Store, userId: string, conversationId: string, now: Date) {
	return store.recordAlert({
		officeId: OFFICE,
		conversationId,
		userId,
		kind: "guest",
		now,
		link: (id) => alertLink("en", id),
		sounds: alertSounds,
	});
}

test("ten alerts for one operator on one thread at the same moment: exactly one sounds", async () => {
	const store = await testInboxStore();
	const conversationId = await thread(store, "burst");
	await Promise.all(
		Array.from({ length: 10 }, () => guestAlert(store, "agent-1", conversationId, at)),
	);
	const rows = await testDb.inboxAlert.findMany({ where: { conversationId, userId: "agent-1" } });
	expect(rows).toHaveLength(10);
	expect(rows.filter((row) => row.sounded)).toHaveLength(1);
	await store.close();
});

test("another operator and another thread each sound on their own", async () => {
	const store = await testInboxStore();
	const first = await thread(store, "first");
	const second = await thread(store, "second");
	const decided = await Promise.all([
		guestAlert(store, "agent-1", first, at),
		guestAlert(store, "agent-2", first, at),
		guestAlert(store, "agent-1", second, at),
	]);
	expect(decided.map((alert) => alert.sounded)).toEqual([true, true, true]);
	await store.close();
});

test("the row is the alert: its link carries its own id, and 2 minutes later it sounds again", async () => {
	const store = await testInboxStore();
	const conversationId = await thread(store, "again");
	const one = await guestAlert(store, "agent-1", conversationId, at);
	const quiet = await guestAlert(store, "agent-1", conversationId, new Date(at.getTime() + MINUTE));
	const back = await guestAlert(
		store,
		"agent-1",
		conversationId,
		new Date(at.getTime() + 3 * MINUTE),
	);
	expect([one.sounded, quiet.sounded, back.sounded]).toEqual([true, false, true]);
	expect(one.link).toBe(`/en/inbox?alert=${one.id}`);
	expect(one.link).not.toContain(conversationId);
	expect(await testDb.inboxAlert.findUniqueOrThrow({ where: { id: one.id } })).toMatchObject({
		userId: "agent-1",
		officeId: OFFICE,
		conversationId,
		kind: "guest",
		sounded: true,
		link: one.link,
		createdAt: at,
	});
	await store.close();
});

test("old alerts are pruned; recent ones stay to resolve their links", async () => {
	const store = await testInboxStore();
	const conversationId = await thread(store, "prune");
	const old = await guestAlert(store, "agent-1", conversationId, new Date("2026-08-01T00:00:00Z"));
	const recent = await guestAlert(store, "agent-1", conversationId, at);
	expect(await store.pruneAlerts(new Date("2026-09-01T00:00:00Z"))).toBe(1);
	const left = await testDb.inboxAlert.findMany({ select: { id: true } });
	expect(left.map((row) => row.id)).toEqual([recent.id]);
	expect(left.map((row) => row.id)).not.toContain(old.id);
	await store.close();
});

test("a thread's alerts go with the thread (guest deletion, ADR 0020)", async () => {
	const store = await testInboxStore();
	const conversationId = await thread(store, "deleted");
	await guestAlert(store, "agent-1", conversationId, at);
	await store.deleteConversations(OFFICE, [conversationId]);
	expect(await testDb.inboxAlert.count({ where: { conversationId } })).toBe(0);
	await store.close();
});
