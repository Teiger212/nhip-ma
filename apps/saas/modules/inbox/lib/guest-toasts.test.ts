import { expect, test } from "vitest";

import { guestToasts, listed, toastStands, waitingOn } from "./guest-toasts";
import type { ConversationSummary } from "./types";

/**
 * Which threads raise a guest toast while Nhịp is open (ADR 0019 "How", spec #84, #136): the
 * operator's own Your-turn threads by the alert recipients' rule (ADR 0022) when the guest wrote
 * since the last poll, and a thread a manager just gave the operator (Eyal, 2026-10-05). The
 * screen is Alerts 12 in docs/e2e-scenarios.md.
 */
const me = { userId: "agent-1", manager: false };
const manager = { userId: "manager", manager: true };

function thread(id: string, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
	return {
		id,
		pipe: "zalo",
		guestId: id,
		guestName: id,
		officeId: "office-a",
		owner: { id: "agent-1", name: "Agent 1" },
		lastGuestInboundAt: "2026-10-05T09:00:00.000Z",
		sentAt: null,
		unansweredInboundId: `${id}-m1`,
		updatedAt: "2026-10-05T09:00:00.000Z",
		crm: null,
		guestLanguage: null,
		lastInboundText: "Xin chào",
		...overrides,
	} as ConversationSummary;
}

test("an agent's own waiting threads count; answered and colleagues' threads do not", () => {
	const threads = [
		thread("mine"),
		thread("answered", { unansweredInboundId: null }),
		thread("colleague", { owner: { id: "agent-2", name: "Agent 2" } }),
		thread("unassigned", { owner: null }),
	];
	expect([...waitingOn(threads, me).keys()]).toEqual(["mine"]);
});

test("a manager's are the Unassigned threads and their own, not an agent's", () => {
	const threads = [
		thread("agent", { owner: { id: "agent-1", name: "Agent 1" } }),
		thread("unassigned", { owner: null }),
		thread("held", { owner: { id: "manager", name: "M" } }),
	];
	expect([...waitingOn(threads, manager).keys()]).toEqual(["unassigned", "held"]);
});

test("a resolved lead is not waiting, even with the guest last", () => {
	const won = thread("won", {
		crm: {
			leadId: "l",
			leadName: "L",
			method: "created",
			outcome: "won",
			outcomeAt: null,
			outcomeReason: null,
			outcomeObservedAt: "2026-10-05T10:00:00.000Z",
		},
	});
	expect(waitingOn([won], me).size).toBe(0);
});

const now = new Date("2026-10-05T09:00:20.000Z").getTime();
const held = { owner: { id: "manager", name: "M" } };

test("a listed thread raises 'waiting' when it waits on a newer message, not when unchanged", () => {
	const threads = [
		thread("same", held),
		thread("again", { ...held, unansweredInboundId: "again-m2" }),
	];
	const before = listed([thread("same", held), thread("again", held)]);
	expect(guestToasts(before, threads, manager, { now })).toEqual([
		{ threadId: "again", kind: "waiting" },
	]);
});

test("a thread new to the list raises 'waiting' only when its guest just wrote", () => {
	const threads = [
		thread("new-guest", { owner: null, lastGuestInboundAt: "2026-10-05T09:00:10.000Z" }),
		thread("old-guest", { owner: null, lastGuestInboundAt: "2026-10-05T08:50:00.000Z" }),
	];
	expect(guestToasts(new Map(), threads, manager, { now })).toEqual([
		{ threadId: "new-guest", kind: "waiting" },
	]);
});

test("a thread just given to the operator raises 'assigned', whether or not its guest just wrote", () => {
	const old = thread("given", { lastGuestInboundAt: "2026-10-05T08:00:00.000Z" });
	// An agent: the thread was not theirs, so not listed at all.
	expect(guestToasts(new Map(), [old], me, { now })).toEqual([
		{ threadId: "given", kind: "assigned" },
	]);
	// A manager: listed as Unassigned, now theirs.
	const before = listed([thread("given", { owner: null })]);
	expect(guestToasts(before, [thread("given", held)], manager, { now })).toEqual([
		{ threadId: "given", kind: "assigned" },
	]);
});

test("the previous owner, a return to Unassigned and the operator's own action raise nothing", () => {
	const before = listed([thread("moved", held)]);
	// Reassigned away from the manager: nothing for them.
	const away = thread("moved", { owner: { id: "agent-1", name: "Agent 1" } });
	expect(guestToasts(before, [away], manager, { now })).toEqual([]);
	// Returned to Unassigned: no new owner, so no toast.
	expect(guestToasts(before, [thread("moved", { owner: null })], manager, { now })).toEqual([]);
	// The manager gave it to themselves.
	const unassigned = listed([thread("claimed", { owner: null })]);
	expect(
		guestToasts(unassigned, [thread("claimed", held)], manager, {
			now,
			ownAction: (id) => id === "claimed",
		}),
	).toEqual([]);
});

test("an open toast goes once the guest is answered, or the thread is someone else's", () => {
	expect(toastStands("waiting", thread("t"), me)).toBe(true);
	expect(toastStands("waiting", thread("t", { unansweredInboundId: null }), me)).toBe(false);
	expect(toastStands("assigned", thread("t", { unansweredInboundId: null }), me)).toBe(true);
	expect(toastStands("assigned", thread("t", { owner: { id: "agent-2", name: "A2" } }), me)).toBe(
		false,
	);
	expect(toastStands("waiting", undefined, me)).toBe(false);
});

test("every listed thread is remembered with its message and owner, answered ones too", () => {
	const threads = [thread("waiting"), thread("answered", { unansweredInboundId: null })];
	expect(listed(threads)).toEqual(
		new Map([
			["waiting", { message: "waiting-m1", ownerId: "agent-1" }],
			["answered", { message: null, ownerId: "agent-1" }],
		]),
	);
});
