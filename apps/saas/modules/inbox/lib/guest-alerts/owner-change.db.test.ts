import { sendEmail } from "@repo/mail";
import { createNotification } from "@repo/notifications";
import { beforeEach, expect, test, vi } from "vitest";

import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { account, guestMessage, membership } from "../test-fixtures";
import { testDb, testInboxStore, useTestDatabaseForAppClient } from "../test-store";
import type { Conversation, Store } from "../types";
import { alertOwnerChange } from "./owner-change";
import type { AlertDelivery, AlertTransport } from "./transport";

/**
 * A manager's owner change, against the test database (ADR 0022 "Alerts", #133;
 * docs/e2e-scenarios.md Alerts 3 and 4): the chosen operator's `assigned` alert, pushed and
 * logged, with the bell row "A manager gave you a thread" opening the alert's link; a return's
 * `returned` alert to the other managers; and the bell row naming the guest for the operator
 * the thread left (P4), which is never pushed, logged as an alert or emailed. The bell rows go
 * through the kit's `createNotification`, and no notification emails (PRODUCT.md "Deliberately
 * not"): only the kit's welcome does.
 */
vi.mock("@repo/mail", () => ({ sendEmail: vi.fn(async () => true) }));
useTestDatabaseForAppClient();

const OFFICE = "office-a";
const at = new Date("2026-10-05T09:00:00.000Z");

let store: Store;
let conversation: Conversation;
let pushed: AlertDelivery[];
const transport: AlertTransport = {
	send: async (deliveries) => {
		pushed.push(...deliveries);
	},
};

async function operator(id: string, platformRole: string | null, memberRole: string) {
	await account(id, { role: platformRole, at });
	await membership(OFFICE, id, memberRole, { at });
}

beforeEach(async () => {
	vi.mocked(sendEmail).mockClear();
	pushed = [];
	store = await testInboxStore();
	await operator("agent-1", "user", "member");
	await operator("agent-2", null, "member");
	await operator("walk-user", "user", "admin");
	await operator("manager-2", null, "admin");
	// The office's creator, its kit `owner`: their membership opens nothing (ADR 0015).
	await operator("platform-admin", "admin", "owner");
	await testDb.user.update({ where: { id: "agent-1" }, data: { locale: "en" } });
	await testDb.user.update({ where: { id: "agent-2" }, data: { locale: null } });
	({ conversation } = await store.upsertInbound(
		guestMessage("zalo-guest-133", { guestName: "Minji Kim" }),
		OFFICE,
	));
});

const runtime = () => ({ store, config: mockInboxConfig(), drafts: noDraftAdapter });

/** The manager (`walk-user`) moves the thread from `previous` to `next`, and its effects run. */
async function move(previous: string | null, next: string | null, actor = "walk-user") {
	await alertOwnerChange(
		runtime(),
		conversation,
		{ previousOwnerId: previous, newOwnerId: next, actorId: actor },
		{ now: () => at, transport },
	);
}

const alerts = () =>
	testDb.inboxAlert.findMany({
		where: { conversationId: conversation.id },
		orderBy: { createdAt: "asc" },
		select: { id: true, userId: true, kind: true, sounded: true, link: true },
	});

const bell = (type: "THREAD_ASSIGNED" | "THREAD_MOVED") =>
	testDb.notification.findMany({
		where: { type },
		select: { userId: true, data: true, link: true },
	});

test("an Unassigned lead given to agent 1: one sounding `assigned` alert, pushed in their language, and a bell row naming no guest that opens the alert", async () => {
	await move(null, "agent-1");

	const logged = await alerts();
	expect(logged).toMatchObject([{ userId: "agent-1", kind: "assigned", sounded: true }]);
	const [alert] = logged;
	expect(alert.link).toBe(`/en/inbox?alert=${alert.id}`);

	expect(pushed).toHaveLength(1);
	expect(pushed[0]).toMatchObject({
		userId: "agent-1",
		payload: {
			alertId: alert.id,
			url: alert.link,
			sound: true,
			title: "Minji Kim was assigned to you",
		},
	});
	expect(JSON.stringify(pushed[0].payload)).not.toContain(conversation.id);

	const rows = await bell("THREAD_ASSIGNED");
	expect(rows.map((row) => row.userId)).toEqual(["agent-1"]);
	expect(rows[0].link?.endsWith(alert.link)).toBe(true);
	expect(JSON.stringify(rows[0].data)).not.toContain("Minji");
	expect(JSON.stringify(rows[0].data)).not.toContain(conversation.id);
	expect(await bell("THREAD_MOVED")).toEqual([]);
	expect(sendEmail).not.toHaveBeenCalled();
});

test("an assignment sounds even right after a guest's alert on the thread for the same operator", async () => {
	await store.recordAlert({
		officeId: OFFICE,
		conversationId: conversation.id,
		userId: "agent-1",
		kind: "guest",
		now: new Date(at.getTime() - 30_000),
		link: (id) => `/en/inbox?alert=${id}`,
		sounds: () => true,
	});
	await move("agent-2", "agent-1");
	const assigned = (await alerts()).filter((row) => row.kind === "assigned");
	expect(assigned).toMatchObject([{ userId: "agent-1", sounded: true }]);
});

test("a reassignment from agent 1 to agent 2: agent 2's alert and bell row; agent 1 only a bell row naming the guest, carrying the thread's id, never pushed or emailed", async () => {
	await move("agent-1", "agent-2");

	expect(await alerts()).toMatchObject([{ userId: "agent-2", kind: "assigned", sounded: true }]);
	expect(pushed.map((delivery) => delivery.userId)).toEqual(["agent-2"]);
	expect((await bell("THREAD_ASSIGNED")).map((row) => row.userId)).toEqual(["agent-2"]);

	const moved = await bell("THREAD_MOVED");
	expect(moved).toHaveLength(1);
	expect(moved[0]).toMatchObject({
		userId: "agent-1",
		data: { threadId: conversation.id, guestName: "Minji Kim" },
	});
	expect(sendEmail).not.toHaveBeenCalled();
});

test("a manager who takes an Unassigned lead themselves: no alert, no push, no bell row", async () => {
	await move(null, "walk-user");
	expect(await alerts()).toEqual([]);
	expect(pushed).toEqual([]);
	expect(
		await testDb.notification.count({
			where: { type: { in: ["THREAD_ASSIGNED", "THREAD_MOVED"] } },
		}),
	).toBe(0);
});

test("a manager who takes agent 1's thread: no alert for anyone, and agent 1 gets the bell row", async () => {
	await move("agent-1", "walk-user");
	expect(await alerts()).toEqual([]);
	expect(pushed).toEqual([]);
	expect(await bell("THREAD_ASSIGNED")).toEqual([]);
	expect((await bell("THREAD_MOVED")).map((row) => row.userId)).toEqual(["agent-1"]);
});

test("agent 1's thread returned to Unassigned: one `returned` alert for the other manager, no bell row for managers, and agent 1 the bell row only", async () => {
	await move("agent-1", null);

	const logged = await alerts();
	expect(logged).toMatchObject([{ userId: "manager-2", kind: "returned" }]);
	// manager-2 never chose a language: Vietnamese.
	expect(logged[0].link).toBe(`/vi/inbox?alert=${logged[0].id}`);
	expect(pushed.map((delivery) => delivery.userId)).toEqual(["manager-2"]);
	expect(await bell("THREAD_ASSIGNED")).toEqual([]);
	expect((await bell("THREAD_MOVED")).map((row) => row.userId)).toEqual(["agent-1"]);
	expect(sendEmail).not.toHaveBeenCalled();
});

test("a nameless guest's bell row carries no name, so it reads as a guest", async () => {
	({ conversation } = await store.upsertInbound(
		guestMessage("zalo-guest-nameless", { text: "Hi" }),
		OFFICE,
	));
	await move("agent-1", "agent-2");
	const moved = await bell("THREAD_MOVED");
	expect(moved).toHaveLength(1);
	expect(moved[0].data).toEqual({ threadId: conversation.id, guestName: null });
});

test("a failed alert does not cost the previous owner their bell row, and its error names no thread", async () => {
	const failing: Store = {
		...store,
		recordAlert: async () => {
			throw new TypeError(`refused for ${conversation.id}`);
		},
	};
	const run = alertOwnerChange(
		{ store: failing, config: mockInboxConfig(), drafts: noDraftAdapter },
		conversation,
		{ previousOwnerId: "agent-1", newOwnerId: "agent-2", actorId: "walk-user" },
		{ now: () => at, transport },
	);
	await expect(run).rejects.toThrow(/TypeError/);
	await expect(run).rejects.not.toThrow(conversation.id);
	expect((await bell("THREAD_MOVED")).map((row) => row.userId)).toEqual(["agent-1"]);
});

test("only the kit's welcome emails: the thread bell rows never do, whatever the preferences say", async () => {
	await createNotification({ userId: "agent-1", type: "WELCOME", data: {} });
	expect(sendEmail).toHaveBeenCalledTimes(1);
	vi.mocked(sendEmail).mockClear();

	await createNotification({ userId: "agent-1", type: "THREAD_ASSIGNED", data: {} });
	await createNotification({
		userId: "agent-1",
		type: "THREAD_MOVED",
		data: { threadId: conversation.id, guestName: "Minji Kim" },
	});
	expect(sendEmail).not.toHaveBeenCalled();
	expect(
		await testDb.notification.count({
			where: { userId: "agent-1", type: { in: ["THREAD_ASSIGNED", "THREAD_MOVED"] } },
		}),
	).toBe(2);
});
