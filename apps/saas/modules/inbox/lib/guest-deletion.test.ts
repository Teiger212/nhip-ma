import type { Funnel } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { oneShot } from "./draft";
import { createGuestDeletion } from "./guest-deletion";
import { testDb, testInboxStore } from "./test-store";

/**
 * Guest deletion (ADR 0020, spec #85): a manager hard-deletes a guest's thread in one
 * transaction that leaves an anonymous lead tally, so Home's numbers never move, and a receipt
 * that names no guest. Refused while a reply is sending; a deletion racing an approval ends
 * with one of them refused, never a deadlock or an error.
 */

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
/** The manager who deletes; the fixtures name users by their id. */
const MANAGER = "agent-2";
const viewer = { userId: "agent-1", officeId: OFFICE };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TZ = "Asia/Ho_Chi_Minh";

type Store = Awaited<ReturnType<typeof testInboxStore>>;
type Thread = { officeId: string; id: string };

const message = (
	guestId: string,
	at: number,
	{
		source = "guest",
		text = "Xin chào",
		guestName = null,
	}: { source?: "guest" | "oa-echo"; text?: string; guestName?: string | null } = {},
) => ({
	pipe: "zalo" as const,
	source,
	guestId,
	guestName,
	text,
	vendorMessageId: null,
	at,
});

async function write(
	store: Store,
	guestId: string,
	at: number,
	options?: Parameters<typeof message>[2],
	officeId = OFFICE,
): Promise<Thread> {
	const { conversation } = await store.upsertInbound(message(guestId, at, options), officeId);
	return { officeId, id: conversation.id };
}

async function lastInboundId(store: Store, { officeId, id }: Thread): Promise<string> {
	const conversation = await store.getOfficeConversation(officeId, id);
	const inbound = conversation?.messages.filter((m) => m.direction === "in").at(-1);
	if (!inbound) throw new Error("no guest message");
	return inbound.id;
}

let sends = 0;
/** Approve the guest's latest message and let the vendor deliver it, as a mock send or a live one. */
async function sent(store: Store, thread: Thread, { mock }: { mock: boolean }) {
	const begun = await store.beginAnswer({
		officeId: thread.officeId,
		conversationId: thread.id,
		inboundId: await lastInboundId(store, thread),
		text: "Reply",
		operatorId: "agent-1",
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	await store.completeAnswer(thread.officeId, begun.answer.id, {
		mock,
		pipe: "zalo",
		vendorMessageId: `vendor-${++sends}`,
	});
}

const deleteOptions = (countMock: boolean) => ({ countMock, actorId: MANAGER });

/** Every number Home shows; `until` is when it was asked, not a number. */
function numbers(funnel: Funnel): Omit<Funnel, "until"> {
	const { until: _until, ...rest } = funnel;
	return rest;
}

/**
 * An office with every kind of lead the funnel tells apart, all inside a 30-day window but one:
 * answered by a mock send, by a live send, from the OA app (`oa_echo`), answered and written
 * back, unanswered, a failed send, and one whose first contact is before the window.
 */
async function officeOfLeads(store: Store, now: number): Promise<Thread[]> {
	const mockAnswered = await write(store, "mock-answered", now - 5 * DAY);
	await sent(store, mockAnswered, { mock: true });
	const liveAnswered = await write(store, "live-answered", now - 4 * DAY);
	await sent(store, liveAnswered, { mock: false });
	const wroteBack = await write(store, "wrote-back", now - 3 * DAY);
	await sent(store, wroteBack, { mock: false });
	await write(store, "wrote-back", now + MINUTE, { text: "Cảm ơn" });
	const mockWroteBack = await write(store, "mock-wrote-back", now - 3 * DAY - 7 * MINUTE);
	await sent(store, mockWroteBack, { mock: true });
	await write(store, "mock-wrote-back", now + 2 * MINUTE, { text: "Ok" });
	const echoed = await write(store, "echoed", now - 2 * DAY);
	await write(store, "echoed", now - 2 * DAY + 17 * MINUTE, { source: "oa-echo", text: "Hi" });
	const unanswered = await write(store, "unanswered", now - 1 * DAY);
	const failed = await write(store, "failed", now - 1 * DAY - 3 * MINUTE);
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId: failed.id,
		inboundId: await lastInboundId(store, failed),
		text: "Reply",
		operatorId: "agent-1",
	});
	if (!begun.ok) throw new Error(begun.reason);
	await store.failAnswer(OFFICE, begun.answer.id, "vendor refused");
	const beforeWindow = await write(store, "before-window", now - 40 * DAY);
	await sent(store, beforeWindow, { mock: false });
	return [
		mockAnswered,
		liveAnswered,
		wroteBack,
		mockWroteBack,
		echoed,
		unanswered,
		failed,
		beforeWindow,
	];
}

for (const countMock of [true, false]) {
	test(`Home's numbers are the same before and after every lead is deleted (countMock ${countMock}, ADR 0020)`, async () => {
		const store = await testInboxStore();
		const now = Date.now();
		const threads = await officeOfLeads(store, now);
		const window = { since: new Date(now - 30 * DAY), countMock, timeZone: TZ };
		const before = await store.funnel(viewer, window);
		// The fixture really exercises the funnel: leads, engaged, in conversation and a p90.
		expect(before.leadsIn).toBe(7);
		expect(before.engaged).toBe(countMock ? 5 : 3);
		expect(before.inConversation).toBe(countMock ? 2 : 1);

		for (const [index, thread] of threads.entries()) {
			expect(await store.deleteGuest(OFFICE, thread.id, deleteOptions(countMock))).toEqual({
				ok: true,
				crm: null,
			});
			// Unchanged after each deletion, not only at the end.
			expect(numbers(await store.funnel(viewer, window)), `after deletion ${index + 1}`).toEqual(
				numbers(before),
			);
		}
		expect(await testDb.conversation.count({ where: { officeId: OFFICE } })).toBe(0);
		await store.close();
	});
}

test("deletion is refused while a reply is sending, and the thread is left whole (ADR 0020, Q8)", async () => {
	const store = await testInboxStore();
	const thread = await write(store, "sending", Date.now() - MINUTE);
	await store.setTranslation(OFFICE, await lastInboundId(store, thread), "en", "Hello");
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId: thread.id,
		inboundId: await lastInboundId(store, thread),
		text: "Reply",
		operatorId: "agent-1",
	});
	expect(begun.ok).toBe(true);
	const whole = await store.getOfficeConversation(OFFICE, thread.id);

	expect(await store.deleteGuest(OFFICE, thread.id, deleteOptions(true))).toEqual({
		ok: false,
		reason: "reply_sending",
	});
	expect(await store.getOfficeConversation(OFFICE, thread.id)).toEqual(whole);
	expect(await testDb.leadTally.count()).toBe(0);
	expect(await testDb.guestDeletion.count()).toBe(0);
	await store.close();
});

test("a thread with no guest message leaves a receipt and no lead tally (ADR 0020)", async () => {
	const store = await testInboxStore();
	// Only a reply from the OA app: nobody wrote in, so there is no lead to keep counting.
	const thread = await write(store, "echo-only", Date.now() - MINUTE, { source: "oa-echo" });
	expect(await store.deleteGuest(OFFICE, thread.id, deleteOptions(true))).toEqual({
		ok: true,
		crm: null,
	});
	expect(await testDb.leadTally.count()).toBe(0);
	expect(await testDb.guestDeletion.count({ where: { officeId: OFFICE } })).toBe(1);
	await store.close();
});

test("another office's thread, or one already gone, is not_found and nothing is written (ADR 0020)", async () => {
	const store = await testInboxStore();
	const theirs = await write(store, "theirs", Date.now() - MINUTE, {}, OTHER_OFFICE);
	expect(await store.deleteGuest(OFFICE, theirs.id, deleteOptions(true))).toEqual({
		ok: false,
		reason: "not_found",
	});
	expect(await store.getOfficeConversation(OTHER_OFFICE, theirs.id)).not.toBeNull();
	expect(await store.deleteGuest(OFFICE, "no-such-thread", deleteOptions(true))).toEqual({
		ok: false,
		reason: "not_found",
	});
	expect(await testDb.guestDeletion.count()).toBe(0);
	expect(await testDb.leadTally.count()).toBe(0);
	await store.close();
});

test("the receipt says who, when and how many rows went; the tally keeps the lead's numbers (ADR 0020)", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	const thread = await write(store, "counted", now - 2 * DAY, { guestName: "Minji Park" });
	await store.setTranslation(OFFICE, await lastInboundId(store, thread), "en", "Hello");
	await store.setTranslation(OFFICE, await lastInboundId(store, thread), "vi", "Xin chào");
	await sent(store, thread, { mock: true });
	await write(store, "counted", now + MINUTE, { text: "Thanks" });
	await write(store, "counted", now + 2 * MINUTE, { text: "See you" });

	expect(await store.deleteGuest(OFFICE, thread.id, deleteOptions(true))).toEqual({
		ok: true,
		crm: null,
	});
	const [receipt] = await testDb.guestDeletion.findMany({ where: { officeId: OFFICE } });
	expect(receipt).toMatchObject({
		actorId: MANAGER,
		actorName: MANAGER,
		// Three guest messages and the reply.
		messages: 4,
		answers: 1,
		translations: 2,
		notifications: 0,
		crmKind: null,
		crmResult: null,
	});
	expect(Math.abs(receipt.at.getTime() - Date.now())).toBeLessThan(60_000);
	const [tally] = await testDb.leadTally.findMany({ where: { officeId: OFFICE } });
	expect(tally).toMatchObject({
		pipe: "zalo",
		firstInboundAt: new Date(now - 2 * DAY),
		inConversation: true,
		outcome: null,
	});
	expect(tally.firstReplyAt).not.toBeNull();
	await store.close();
});

test("a thread's CRM lead is unlinked with it, and the receipt says so without the lead's id (ADR 0020)", async () => {
	const store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const thread = await write(store, "linked", Date.now() - MINUTE, { guestName: "Linh Tran" });
	expect(await store.claimCrmLink(OFFICE, thread.id)).toBe(true);
	await store.completeCrmLink(OFFICE, thread.id, {
		leadId: "lead-linked-1",
		leadName: "Linh Tran",
		method: "created",
	});
	await store.saveCrmOutcome(OFFICE, thread.id, "lead-linked-1", {
		outcome: "won",
		outcomeAt: null,
		outcomeReason: null,
		outcomeObservedAt: new Date().toISOString(),
	});

	expect(await store.deleteGuest(OFFICE, thread.id, deleteOptions(true))).toEqual({
		ok: true,
		crm: "unlinked",
	});
	expect(await testDb.crmLink.count({ where: { conversationId: thread.id } })).toBe(0);
	const [receipt] = await testDb.guestDeletion.findMany({ where: { officeId: OFFICE } });
	expect(receipt).toMatchObject({ crmKind: "mock", crmResult: "unlinked" });
	const [tally] = await testDb.leadTally.findMany({ where: { officeId: OFFICE } });
	expect(tally.outcome).toBe("won");
	await store.close();
});

/** Every row of every inbox table, and the kit's bell rows, as text. */
async function everyRowAsText(): Promise<string[]> {
	const tables = await testDb.$queryRaw<Array<{ name: string }>>`
		SELECT table_name AS name FROM information_schema.tables
		WHERE table_schema = 'public' AND (table_name LIKE 'inbox\\_%' OR table_name = 'notification')`;
	expect(tables.map((table) => table.name)).toEqual(
		expect.arrayContaining(["inbox_conversation", "inbox_lead_tally", "inbox_guest_deletion"]),
	);
	const rows: string[] = [];
	for (const { name } of tables) {
		const found = await testDb.$queryRawUnsafe<Array<{ row: string }>>(
			`SELECT row_to_json(t)::text AS row FROM "${name}" t`,
		);
		rows.push(...found.map((r) => `${name}: ${r.row}`));
	}
	return rows;
}

// Nhịp's own rows only: the lead in the office's CRM (here it would be a mock CRM lead, whose
// thread link holds the id) is the office's record, deleted only when the manager ticks the box
// (#139).
test("after a deletion no row of Nhịp's carries the thread, and the records name no guest (ADR 0020)", async () => {
	const store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const guestId = "zalo-user-8812734";
	const guestName = "Nguyễn Thị Hoa";
	const now = Date.now();
	const thread = await write(store, guestId, now - DAY, { guestName });
	await store.setTranslation(OFFICE, await lastInboundId(store, thread), "en", "Hello");
	await store.claimCrmLink(OFFICE, thread.id);
	await store.completeCrmLink(OFFICE, thread.id, {
		leadId: "lead-8812734",
		leadName: guestName,
		method: "created",
	});
	await sent(store, thread, { mock: true });
	await write(store, guestId, now + MINUTE, { text: "Cảm ơn" });
	await testDb.inboxAlert.create({
		data: {
			id: "alert-on-hoa",
			userId: "agent-1",
			conversationId: thread.id,
			officeId: OFFICE,
			kind: "guest",
			sounded: true,
			link: "/en/inbox?alert=alert-on-hoa",
		},
	});
	const kept = await write(store, "someone-else", now - DAY);

	expect((await store.deleteGuest(OFFICE, thread.id, deleteOptions(true))).ok).toBe(true);

	const leftovers = (await everyRowAsText()).filter(
		(row) =>
			row.includes(thread.id) ||
			row.includes(guestId) ||
			row.includes(guestName) ||
			row.includes("lead-8812734"),
	);
	expect(leftovers).toEqual([]);
	expect(await store.getOfficeConversation(OFFICE, kept.id)).not.toBeNull();
	// The records exist: what is gone is the guest, not the fact of the deletion.
	expect(await testDb.guestDeletion.count({ where: { officeId: OFFICE } })).toBe(1);
	expect(await testDb.leadTally.count({ where: { officeId: OFFICE } })).toBe(1);
	await store.close();
});

test("bell rows naming the thread go with it and are counted; others stay (ADR 0020)", async () => {
	const store = await testInboxStore();
	const thread = await write(store, "moved", Date.now() - MINUTE);
	const other = await write(store, "stays", Date.now() - MINUTE);
	// The reassignment bell row's shape: `data.threadId` is the thread's opaque id.
	await testDb.notification.deleteMany({ where: { userId: { in: ["agent-1", "agent-2"] } } });
	await testDb.notification.createMany({
		data: [
			{
				userId: "agent-1",
				type: "APP_UPDATE",
				data: { threadId: thread.id, guest: "Moved Guest" },
			},
			{ userId: "agent-2", type: "APP_UPDATE", data: { threadId: thread.id } },
			{ userId: "agent-1", type: "APP_UPDATE", data: { threadId: other.id } },
			{ userId: "agent-1", type: "WELCOME", data: {} },
		],
	});

	expect((await store.deleteGuest(OFFICE, thread.id, deleteOptions(true))).ok).toBe(true);

	const left = await testDb.notification.findMany({
		where: { userId: { in: ["agent-1", "agent-2"] } },
		select: { data: true },
	});
	expect(left.map((row) => row.data)).toEqual(expect.arrayContaining([{ threadId: other.id }, {}]));
	expect(left).toHaveLength(2);
	const [receipt] = await testDb.guestDeletion.findMany({ where: { officeId: OFFICE } });
	expect(receipt.notifications).toBe(2);
	await testDb.notification.deleteMany({ where: { userId: { in: ["agent-1", "agent-2"] } } });
	await store.close();
});

/** Resolves once `count` other sessions on the test database wait on a lock. */
async function lockWaiters(count: number): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const [row] = await testDb.$queryRaw<Array<{ waiting: number }>>`
			SELECT count(*)::int AS waiting FROM pg_stat_activity
			WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
		if ((row?.waiting ?? 0) >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`lockWaiters: ${count} never waited on a lock`);
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Run `work` now and keep its outcome, so a rejection waits to be read instead of escaping. */
async function settle<T>(work: () => Promise<T>): Promise<Settled<T>> {
	try {
		return { ok: true, value: await work() };
	} catch (error) {
		return { ok: false, error };
	}
}

/**
 * Two writers on one thread, queued in a known order (ADR 0020, "Approve takes the same locks
 * in the same order"): a third session holds the conversation's row lock, `first` starts and
 * waits on it, then `second` does; Postgres grants the row to its waiters in turn, so `first`
 * runs first on every run, not by chance. Both outcomes come back; a throw (a `40P01`
 * deadlock, a timeout) fails the test.
 */
async function inOrder<A, B>(
	thread: Thread,
	first: () => Promise<A>,
	second: () => Promise<B>,
): Promise<[A, B]> {
	let queued: [Promise<Settled<A>>, Promise<Settled<B>>] | undefined;
	await testDb.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT 1 FROM "inbox_conversation" WHERE "id" = ${thread.id} FOR UPDATE`;
			// Not awaited here: both must queue behind this lock before it is released.
			const a = settle(first);
			await lockWaiters(1);
			const b = settle(second);
			await lockWaiters(2);
			queued = [a, b];
		},
		{ timeout: 15_000 },
	);
	const [a, b] = await Promise.all(queued!);
	if (!a.ok) throw a.error;
	if (!b.ok) throw b.error;
	return [a.value, b.value];
}

/** The thread's first approval, of its latest guest message. */
async function approval(store: Store, thread: Thread, operatorId: string | null) {
	const inboundId = await lastInboundId(store, thread);
	return () =>
		store.beginAnswer({
			officeId: OFFICE,
			conversationId: thread.id,
			inboundId,
			text: "Reply",
			operatorId,
		});
}

const deletion = (store: Store, thread: Thread) => () =>
	store.deleteGuest(OFFICE, thread.id, deleteOptions(true));

/** Approval first: the delete waits, sees the reply sending and refuses; the thread stays. */
async function approvedFirst(store: Store, thread: Thread, operatorId: string | null) {
	const [approved, deleted] = await inOrder(
		thread,
		await approval(store, thread, operatorId),
		deletion(store, thread),
	);
	expect(approved.ok).toBe(true);
	expect(deleted).toEqual({ ok: false, reason: "reply_sending" });
	expect(await testDb.conversation.count({ where: { id: thread.id } })).toBe(1);
}

/** Delete first: the approval waits, then finds no thread (`not_found`); nothing is sent. */
async function deletedFirst(store: Store, thread: Thread, operatorId: string | null) {
	const [deleted, approved] = await inOrder(
		thread,
		deletion(store, thread),
		await approval(store, thread, operatorId),
	);
	expect(deleted).toEqual({ ok: true, crm: null });
	expect(approved).toEqual({ ok: false, reason: "not_found" });
	expect(await testDb.conversation.count({ where: { id: thread.id } })).toBe(0);
	expect(await testDb.answer.count({ where: { conversationId: thread.id } })).toBe(0);
}

/** A thread whose first approval failed at the vendor, so the next approval is a retry. */
async function failedOnce(store: Store, guestId: string, operatorId: string | null) {
	const thread = await write(store, guestId, Date.now() - MINUTE);
	const begun = await (await approval(store, thread, operatorId))();
	if (!begun.ok) throw new Error(begun.reason);
	await store.failAnswer(OFFICE, begun.answer.id, "token expired");
	return thread;
}

test("deletion and the first approval of a pool thread, either first: exactly one is refused (ADR 0020)", async () => {
	const store = await testInboxStore();
	await approvedFirst(store, await write(store, "pool-a", Date.now() - MINUTE), "agent-1");
	await deletedFirst(store, await write(store, "pool-d", Date.now() - MINUTE), "agent-1");
	await store.close();
});

test("deletion and the retry of a failed Answer, either first: exactly one is refused (ADR 0020)", async () => {
	const store = await testInboxStore();
	await approvedFirst(store, await failedOnce(store, "retry-a", "agent-1"), "agent-1");
	await deletedFirst(store, await failedOnce(store, "retry-d", "agent-1"), "agent-1");
	await store.close();
});

test("deletion and the retry on an ownerless pool thread, either first: exactly one is refused (ADR 0020)", async () => {
	const store = await testInboxStore();
	// The failed first approval had no operator: the retry claims the pool thread, so approve
	// writes the Answer and the conversation.
	const approvedThread = await failedOnce(store, "ownerless-a", null);
	expect((await store.getOfficeConversation(OFFICE, approvedThread.id))?.owner).toBeNull();
	await approvedFirst(store, approvedThread, "agent-2");
	await deletedFirst(store, await failedOnce(store, "ownerless-d", null), "agent-2");
	await store.close();
});

test("the vendor's answer and a deletion, either first: the reply is recorded and nothing deadlocks (ADR 0020)", async () => {
	const store = await testInboxStore();
	for (const order of ["vendor first", "delete first"] as const) {
		const thread = await write(store, `completing-${order}`, Date.now() - MINUTE);
		const begun = await (await approval(store, thread, "agent-1"))();
		if (!begun.ok) throw new Error(begun.reason);
		const complete = () =>
			store.completeAnswer(OFFICE, begun.answer.id, {
				mock: true,
				pipe: "zalo",
				vendorMessageId: `vendor-${order}`,
			});
		const [, deleted] =
			order === "vendor first"
				? await inOrder(thread, complete, deletion(store, thread))
				: (await inOrder(thread, deletion(store, thread), complete)).reverse();
		if (order === "delete first") {
			// The delete found the reply still sending and refused; the reply was then recorded.
			expect(deleted, order).toEqual({ ok: false, reason: "reply_sending" });
			const answer = await testDb.answer.findUniqueOrThrow({ where: { id: begun.answer.id } });
			expect(answer.status, order).toBe("sent");
		} else {
			// The delete waited for the send to be recorded, then deleted the thread.
			expect(deleted, order).toEqual({ ok: true, crm: null });
		}
	}
	await store.close();
});

test("a guest writing as their thread is deleted arrives as a new guest, not an error (ADR 0020, Q6)", async () => {
	const store = await testInboxStore();
	const thread = await write(store, "writes-again", Date.now() - DAY);
	const [deleted, arrived] = await inOrder(thread, deletion(store, thread), () =>
		store.upsertInbound(message("writes-again", Date.now(), { text: "Hello again" }), OFFICE),
	);
	expect(deleted).toEqual({ ok: true, crm: null });
	expect(arrived.inserted).toBe(true);
	expect(arrived.conversation.id).not.toBe(thread.id);
	expect(arrived.conversation.messages.map((m) => m.text)).toEqual(["Hello again"]);
	await store.close();
});

test("a one-shot landing on a thread being deleted finds no thread, not a deadlock (ADR 0020)", async () => {
	const store = await testInboxStore();
	const thread = await write(store, "re-extracted", Date.now() - MINUTE);
	const inboundId = await lastInboundId(store, thread);
	// The thread already has its extracted details, so a re-run updates the rows under it.
	await store.setOneShot(OFFICE, thread.id, oneShot("Looking to rent in Tay Ho", inboundId));
	const [deleted, shot] = await inOrder(thread, deletion(store, thread), () =>
		store.setOneShot(OFFICE, thread.id, oneShot("Now looking to buy in Thao Dien", inboundId)),
	);
	expect(deleted).toEqual({ ok: true, crm: null });
	expect(shot).toBeNull();
	await store.close();
});

test("the guest-deletion module deletes as the manager, under the deployment's countMock (ADR 0020)", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	const thread = await write(store, "via-module", now - DAY);
	await sent(store, thread, { mock: true });
	const deletion = createGuestDeletion({ store, countMock: true });
	expect(
		await deletion.deleteGuest({ userId: MANAGER, officeId: OFFICE, role: "manager" }, thread.id, {
			deleteInCrm: true,
		}),
	).toEqual({ ok: true, crm: null });
	const [tally] = await testDb.leadTally.findMany({ where: { officeId: OFFICE } });
	// Under countMock the mock send is the lead's first reply, as Home reads it in this deployment.
	expect(tally.firstReplyAt).not.toBeNull();
	const [receipt] = await testDb.guestDeletion.findMany({ where: { officeId: OFFICE } });
	expect(receipt.actorId).toBe(MANAGER);
	expect(
		await deletion.deleteGuest({ userId: MANAGER, officeId: OFFICE, role: "manager" }, thread.id, {
			deleteInCrm: false,
		}),
	).toEqual({ ok: false, reason: "not_found" });
	await store.close();
});
