import { expect, test } from "vitest";

import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { testDb, testInboxStore } from "../test-store";
import type { Store } from "../types";
import { alertSounds } from "./burst";
import { alertLink } from "./content";
import { alertGuestMessage } from "./index";
import { alertTag } from "./tag";
import type { AlertPayload } from "./transport";

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

async function member(officeId: string, userId: string, role: string) {
	await testDb.member.upsert({
		where: { organizationId_userId: { organizationId: officeId, userId } },
		create: {
			id: `m-${officeId}-${userId}`,
			organizationId: officeId,
			userId,
			role,
			createdAt: at,
		},
		update: { role },
	});
}

test("an operator in two offices opens no thread (ADR 0010), so no office alerts them", async () => {
	const store = await testInboxStore();
	await testDb.member.deleteMany({ where: { userId: { in: ["agent-1", "agent-2"] } } });
	await member(OFFICE, "agent-1", "member");
	await member(OFFICE, "agent-2", "member");
	await member("office-b", "agent-2", "member");
	const operators = (await store.officeOperators(OFFICE)).map((operator) => operator.userId);
	expect(operators).toContain("agent-1");
	expect(operators).not.toContain("agent-2");
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

test("one operator's failed alert never costs the others theirs", async () => {
	const store = await testInboxStore();
	await testDb.member.deleteMany({ where: { userId: { in: ["agent-1", "agent-2"] } } });
	await member(OFFICE, "agent-1", "member");
	await member(OFFICE, "agent-2", "member");
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId: "one-fails",
			guestName: null,
			text: "Hi",
			vendorMessageId: null,
		},
		OFFICE,
	);
	// The store refuses agent-2's alert, as a database error would; everyone else's is written.
	const failing: Store = {
		...store,
		recordAlert: async (alert) => {
			if (alert.userId === "agent-2") throw new TypeError("refused");
			return store.recordAlert(alert);
		},
	};
	const runtime = { store: failing, config: mockInboxConfig(), drafts: noDraftAdapter };
	await expect(alertGuestMessage(runtime, conversation)).rejects.toThrow(
		"failed for 1 recipient(s) (TypeError)",
	);
	const alerted = await testDb.inboxAlert.findMany({
		where: { conversationId: conversation.id },
		select: { userId: true },
	});
	expect(alerted.map((row) => row.userId)).toContain("agent-1");
	expect(alerted.map((row) => row.userId)).not.toContain("agent-2");
	await store.close();
});

test("each operator's alert is in their language, and the payload names no thread and no guest", async () => {
	const store = await testInboxStore();
	await testDb.member.deleteMany({ where: { organizationId: OFFICE } });
	await member(OFFICE, "agent-1", "member");
	await member(OFFICE, "agent-2", "member");
	await testDb.user.update({ where: { id: "agent-1" }, data: { locale: "en" } });
	await testDb.user.update({ where: { id: "agent-2" }, data: { locale: null } });
	const guestId = "zalo-guest-4471";
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId,
			guestName: "Minji",
			text: "안녕하세요",
			vendorMessageId: null,
		},
		OFFICE,
	);
	const korean = {
		...conversation,
		oneShot: { ...conversation.oneShot!, language: "ko" as const },
	};
	const sent: { userId: string; payload: AlertPayload }[] = [];
	const transport = {
		send: async (userId: string, payload: AlertPayload) => void sent.push({ userId, payload }),
	};
	const runtime = { store, config: mockInboxConfig(), drafts: noDraftAdapter };
	await alertGuestMessage(runtime, korean, { transport });

	const byUser = Object.fromEntries(sent.map(({ userId, payload }) => [userId, payload]));
	expect(byUser["agent-1"]).toMatchObject({ title: "Minji is waiting", body: "Zalo · Korean" });
	expect(byUser["agent-2"]).toMatchObject({ title: "Minji đang chờ", body: "Zalo · tiếng Hàn" });
	const rows = await testDb.inboxAlert.findMany({ where: { conversationId: conversation.id } });
	for (const { userId, payload } of sent) {
		expect(Object.keys(payload).sort()).toEqual([
			"alertId",
			"body",
			"sound",
			"tag",
			"title",
			"url",
		]);
		const row = rows.find((candidate) => candidate.id === payload.alertId);
		expect(row?.userId).toBe(userId);
		expect(payload.url).toBe(row?.link);
		expect(payload.sound).toBe(row?.sounded);
		expect(payload.tag).toBe(alertTag(conversation.id));
		expect(JSON.stringify(payload)).not.toContain(conversation.id);
		expect(JSON.stringify(payload)).not.toContain(guestId);
		expect(JSON.stringify(payload)).not.toContain("안녕하세요");
	}
	expect(byUser["agent-1"].url).toMatch(/^\/en\/inbox\?alert=/);
	expect(byUser["agent-2"].url).toMatch(/^\/vi\/inbox\?alert=/);
	await store.close();
});
