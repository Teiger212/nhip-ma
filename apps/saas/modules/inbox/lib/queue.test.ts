import { expect, test } from "vitest";

import {
	buildQueueView,
	inView,
	inQueue,
	isInboxView,
	isQuiet,
	isResolved,
	threadStatus,
	waitingNow,
	nextSelection,
	openingView,
	viewsFor,
	QUIET_AFTER_MS,
	yourTurnCount,
} from "./queue";
import type { ConversationCrm, ConversationSummary } from "./types";

const NOW = new Date("2026-09-05T12:00:00.000Z").getTime();

function conv(
	partial: Partial<ConversationSummary> & Pick<ConversationSummary, "id" | "guestName">,
): ConversationSummary {
	const at = partial.lastGuestInboundAt ?? "2026-09-01T00:00:00.000Z";
	return {
		pipe: "zalo",
		guestId: partial.id,
		officeId: "walk-office",
		owner: null,
		lastGuestInboundAt: at,
		sentAt: null,
		unansweredInboundId: `${partial.id}:1`,
		crm: null,
		updatedAt: at,
		guestLanguage: null,
		lastInboundText: `hello from ${partial.guestName}`,
		...partial,
	};
}

/** Wrote 4 hours ago: active. */
const minji = conv({
	id: "wa:minji",
	guestName: "Minji",
	lastGuestInboundAt: "2026-09-05T08:00:00.000Z",
});
/** Wrote 28 hours ago: still active. */
const yuki = conv({
	id: "wa:yuki",
	guestName: "Yuki",
	lastGuestInboundAt: "2026-09-04T08:00:00.000Z",
});
/** Wrote three days ago and never got a reply: quiet. */
const thao = conv({
	id: "zalo:thao",
	guestName: "Thảo",
	lastGuestInboundAt: "2026-09-02T08:00:00.000Z",
});
/** Office spoke last: sent. */
const alexei = conv({
	id: "wa:alexei",
	guestName: "Alexei",
	lastGuestInboundAt: "2026-09-02T08:00:00.000Z",
	sentAt: "2026-09-04T08:00:00.000Z",
	unansweredInboundId: null,
	updatedAt: "2026-09-04T08:00:00.000Z",
});
const all = [minji, yuki, thao, alexei];

test("your turn is the default queue, oldest waiting guest first, quiet at the bottom", () => {
	const q = buildQueueView(all, "yourTurn", "", NOW);
	expect(q.visible.map((c) => c.guestName)).toEqual(["Yuki", "Minji"]);
	expect(q.quiet.map((c) => c.guestName)).toEqual(["Thảo"]);
	expect(q.counts).toEqual({ unassigned: 4, yourTurn: 3, sent: 1, all: 4 });
	expect(q.caughtUp).toBe(false);
});

test("quiet is a fact about the guest's last message, 48 hours, not a setting", () => {
	expect(isQuiet(yuki, NOW)).toBe(false);
	expect(isQuiet(thao, NOW)).toBe(true);
	expect(isQuiet(alexei, NOW)).toBe(false);
	const edge = conv({
		id: "wa:edge",
		guestName: "Edge",
		lastGuestInboundAt: new Date(NOW - QUIET_AFTER_MS).toISOString(),
	});
	expect(isQuiet(edge, NOW)).toBe(false);
	expect(isQuiet(edge, NOW + 1)).toBe(true);
});

test("sent and all views order by most recent activity and have no quiet section", () => {
	const sent = buildQueueView(all, "sent", "", NOW);
	expect(sent.visible.map((c) => c.guestName)).toEqual(["Alexei"]);
	expect(sent.quiet).toEqual([]);
	const every = buildQueueView(all, "all", "", NOW);
	expect(every.visible.map((c) => c.guestName)).toEqual(["Minji", "Yuki", "Alexei", "Thảo"]);
	expect(every.quiet).toEqual([]);
});

test("tab counts follow the search so they agree with the list", () => {
	const q = buildQueueView(all, "yourTurn", "yuki", NOW);
	expect(q.visible.map((c) => c.guestName)).toEqual(["Yuki"]);
	expect(q.counts).toEqual({ unassigned: 1, yourTurn: 1, sent: 0, all: 1 });
	expect(q.caughtUp).toBe(false);
});

test("caught up only when nothing waits, quiet included, with no search and threads exist", () => {
	expect(buildQueueView([alexei], "yourTurn", "", NOW).caughtUp).toBe(true);
	expect(buildQueueView([alexei, thao], "yourTurn", "", NOW).caughtUp).toBe(false);
	expect(buildQueueView([alexei], "yourTurn", "zzz", NOW).caughtUp).toBe(false);
	expect(buildQueueView([], "yourTurn", "", NOW).caughtUp).toBe(false);
	expect(buildQueueView([alexei], "sent", "", NOW).caughtUp).toBe(false);
});

test("a send leaves the queue only when it answers the guest's last message", () => {
	// The guest wrote back after a send: sentAt is set, yet it is Your turn again.
	const back = conv({
		id: "wa:back",
		guestName: "Back",
		lastGuestInboundAt: "2026-09-05T09:00:00.000Z",
		sentAt: "2026-09-04T08:00:00.000Z",
	});
	expect(inView(back, "yourTurn")).toBe(true);
	expect(inView(back, "sent")).toBe(false);
	expect(inView(alexei, "yourTurn")).toBe(false);
	expect(inView(alexei, "sent")).toBe(true);
	expect(inView(alexei, "all")).toBe(true);
});

test("selection stays when listed, otherwise advances to the first active thread, then quiet", () => {
	const q = buildQueueView(all, "yourTurn", "", NOW);
	const ordered = [...q.visible, ...q.quiet];
	expect(nextSelection(ordered, "wa:minji")).toBe("wa:minji");
	expect(nextSelection(ordered, "zalo:thao")).toBe("zalo:thao");
	const afterSend = buildQueueView(
		all.map((c) => (c.id === "wa:yuki" ? { ...c, unansweredInboundId: null } : c)),
		"yourTurn",
		"",
		NOW,
	);
	expect(nextSelection([...afterSend.visible, ...afterSend.quiet], "wa:yuki")).toBe("wa:minji");
	expect(nextSelection([], "wa:yuki")).toBeNull();
	expect(nextSelection(ordered, null)).toBe("wa:yuki");
	const onlyQuiet = buildQueueView([thao, alexei], "yourTurn", "", NOW);
	expect(nextSelection([...onlyQuiet.visible, ...onlyQuiet.quiet], null)).toBe("zalo:thao");
});

// #267: a thread the manager just assigned stays open though it left the view; a send doesn't pin.
test("a pinned selection stays though it left the view, and only it", () => {
	const q = buildQueueView(all, "yourTurn", "", NOW);
	const ordered = [...q.visible, ...q.quiet];
	expect(nextSelection(ordered, "gone", "gone")).toBe("gone");
	expect(nextSelection([], "gone", "gone")).toBe("gone");
	expect(nextSelection(ordered, "gone", null)).toBe("wa:yuki");
	expect(nextSelection(ordered, "gone", "another")).toBe("wa:yuki");
	expect(nextSelection(ordered, null, "gone")).toBe("wa:yuki");
});

test("view parsing", () => {
	expect(isInboxView("sent")).toBe(true);
	expect(isInboxView("yourTurn")).toBe(true);
	expect(isInboxView("unassigned")).toBe(true);
	expect(isInboxView("needsReply")).toBe(false);
});

// ADR 0004: the nav's Your-turn count and the inbox's Your turn tab count the same threads.
test("the Your-turn count is the threads whose guest spoke last, quiet ones included", () => {
	// Minji and Yuki wait, Thảo waits quietly; the office answered Alexei.
	expect(yourTurnCount(all)).toBe(3);
	expect(yourTurnCount([alexei])).toBe(0);
	expect(yourTurnCount([])).toBe(0);
	expect(buildQueueView(all, "sent", "", NOW).counts).toEqual({
		unassigned: 4,
		yourTurn: 3,
		sent: 1,
		all: 4,
	});
});

/** A linked lead whose outcome Nhịp observed at `observedAt`; the CRM dates it `outcomeAt`. */
const crm = (
	outcome: "open" | "won" | "lost",
	observedAt: string,
	outcomeAt: string = observedAt,
): ConversationCrm => ({
	leadId: "lead-1",
	leadName: "Lead",
	method: "created",
	outcome,
	outcomeAt,
	outcomeReason: null,
	outcomeObservedAt: outcome === "open" ? null : observedAt,
});

// CONTEXT "Resolved": the CRM reports won or lost; it leaves the queue, visible under Sent / All.
test("a won or lost lead leaves the queue and the count, and shows under Sent and All", () => {
	const lost = conv({
		id: "lost",
		guestName: "L",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: crm("lost", "2026-09-04T11:00:00.000Z"),
	});
	const open = conv({
		id: "open",
		guestName: "O",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: crm("open", "2026-09-04T11:00:00.000Z"),
	});
	expect(isResolved(lost)).toBe(true);
	expect(inQueue(lost)).toBe(false);
	expect(inQueue(open)).toBe(true);
	expect(yourTurnCount([lost, open])).toBe(1);
	const queue = buildQueueView([lost, open], "yourTurn", "", NOW);
	expect(queue.visible.map((c) => c.id)).toEqual(["open"]);
	expect(queue.counts).toEqual({ unassigned: 2, yourTurn: 1, sent: 1, all: 2 });
	expect(buildQueueView([lost, open], "sent", "", NOW).visible.map((c) => c.id)).toEqual(["lost"]);
	expect(buildQueueView([lost, open], "all", "", NOW).visible).toHaveLength(2);
});

// CONTEXT "Resolved": it leaves the queue until the guest writes again.
test("a guest who writes after Nhịp observed the outcome is back in the queue", () => {
	const wroteBack = conv({
		id: "back",
		guestName: "B",
		lastGuestInboundAt: "2026-09-04T12:00:00.000Z",
		crm: crm("lost", "2026-09-04T11:00:00.000Z"),
	});
	expect(isResolved(wroteBack)).toBe(false);
	expect(inQueue(wroteBack)).toBe(true);
});

// ADR 0003 (Q3): the time Nhịp first saw the outcome decides, never the CRM's own close date.
test("a backdated close still resolves a guest who wrote before Nhịp saw it", () => {
	// The CRM dates the loss at 09:00; the guest wrote at 10:00; Nhịp saw the loss at 11:00.
	const backdated = conv({
		id: "backdated",
		guestName: "D",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: crm("lost", "2026-09-04T11:00:00.000Z", "2026-09-04T09:00:00.000Z"),
	});
	expect(isResolved(backdated)).toBe(true);
});

// ADR 0003 (fails open): missing data never hides a guest.
test("a decided outcome with no observation time is not resolved", () => {
	const unobserved = conv({
		id: "unobserved",
		guestName: "U",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: { ...crm("lost", "2026-09-04T11:00:00.000Z"), outcomeObservedAt: null },
	});
	expect(isResolved(unobserved)).toBe(false);
	expect(inQueue(unobserved)).toBe(true);
});

// DESIGN.md "Won and Lost": the CRM's outcome replaces the turn while resolved.
test("a thread's status: the outcome while resolved, the turn otherwise", () => {
	const lost = conv({
		id: "l",
		guestName: "L",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: crm("lost", "2026-09-04T11:00:00.000Z"),
	});
	const won = conv({
		id: "w",
		guestName: "W",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: crm("won", "2026-09-04T11:00:00.000Z"),
	});
	const back = conv({
		id: "b",
		guestName: "B",
		lastGuestInboundAt: "2026-09-04T12:00:00.000Z",
		crm: crm("won", "2026-09-04T11:00:00.000Z"),
	});
	const answered = conv({ id: "a", guestName: "A", unansweredInboundId: null });
	expect([lost, won, back, answered, conv({ id: "p", guestName: "P" })].map(threadStatus)).toEqual([
		"lost",
		"won",
		"yourTurn",
		"sent",
		"yourTurn",
	]);
});

/* ADR 0022 (#163): the managers' Unassigned view, and Waiting now's Unassigned leads first. */

// CONTEXT "Unassigned": only managers see it, and their Inbox opens on it.
test("Unassigned is a manager's first and opening view; an agent has no such view", () => {
	expect(viewsFor(true)).toEqual(["unassigned", "yourTurn", "sent", "all"]);
	expect(viewsFor(false)).toEqual(["yourTurn", "sent", "all"]);
	expect(openingView(true, null)).toBe("unassigned");
	expect(openingView(false, null)).toBe("yourTurn");
	expect(openingView(false, "unassigned")).toBe("yourTurn");
	expect(openingView(true, "sent")).toBe("sent");
	expect(openingView(false, "all")).toBe("all");
});

const agentOne = { id: "agent-1", name: "Agent One" };
/** Unassigned, waiting since four hours ago. */
const newLead = conv({
	id: "zalo:new",
	guestName: "New",
	lastGuestInboundAt: "2026-09-05T08:00:00.000Z",
});
/** Unassigned, waiting since a day ago. */
const olderLead = conv({
	id: "zalo:older",
	guestName: "Older",
	lastGuestInboundAt: "2026-09-04T12:00:00.000Z",
});
/** Unassigned, three days quiet. */
const quietLead = conv({
	id: "zalo:quiet",
	guestName: "Quiet",
	lastGuestInboundAt: "2026-09-02T08:00:00.000Z",
});
/** Unassigned and answered (from the vendor's own app, say): not Your turn. */
const answeredLead = conv({
	id: "zalo:answered",
	guestName: "Answered",
	lastGuestInboundAt: "2026-09-03T08:00:00.000Z",
	sentAt: "2026-09-03T09:00:00.000Z",
	unansweredInboundId: null,
	updatedAt: "2026-09-03T09:00:00.000Z",
});
/** Agent one's, waiting longer than every active Unassigned lead. */
const ownedLong = conv({
	id: "zalo:owned-long",
	guestName: "OwnedLong",
	lastGuestInboundAt: "2026-09-03T12:00:00.000Z",
	owner: agentOne,
});
/** Agent one's, waiting since an hour ago. */
const ownedRecent = conv({
	id: "zalo:owned-recent",
	guestName: "OwnedRecent",
	lastGuestInboundAt: "2026-09-05T11:00:00.000Z",
	owner: agentOne,
});
/** Agent one's, four days quiet. */
const ownedQuiet = conv({
	id: "zalo:owned-quiet",
	guestName: "OwnedQuiet",
	lastGuestInboundAt: "2026-09-01T08:00:00.000Z",
	owner: agentOne,
});
const office = [newLead, ownedRecent, olderLead, ownedLong, answeredLead, quietLead, ownedQuiet];
const names = (list: ConversationSummary[]) => list.map((c) => c.guestName);

// CONTEXT "Unassigned"; spec #160: no owner, whatever the turn, oldest waiting first.
test("Unassigned lists every thread with no owner, whatever its turn, oldest guest message first", () => {
	const q = buildQueueView(office, "unassigned", "", NOW);
	expect(names(q.visible)).toEqual(["Quiet", "Answered", "Older", "New"]);
	expect(inView(ownedLong, "unassigned")).toBe(false);
	expect(inView(answeredLead, "unassigned")).toBe(true);
});

test("Unassigned has no quiet fold: a quiet lead still waits on a manager to assign it", () => {
	const q = buildQueueView(office, "unassigned", "", NOW);
	expect(q.quiet).toEqual([]);
	expect(names(q.visible)).toContain("Quiet");
});

test("the Unassigned count is the threads with no owner, and follows the search", () => {
	expect(buildQueueView(office, "yourTurn", "", NOW).counts.unassigned).toBe(4);
	expect(buildQueueView(office, "unassigned", "older", NOW).counts).toEqual({
		unassigned: 1,
		yourTurn: 1,
		sent: 0,
		all: 1,
	});
	expect(buildQueueView(office, "unassigned", "owned", NOW).counts.unassigned).toBe(0);
});

test("every lead assigned is the Unassigned view's own empty state, not caught up or no matches", () => {
	const owned = [ownedLong, ownedRecent];
	expect(buildQueueView(owned, "unassigned", "", NOW).allAssigned).toBe(true);
	expect(buildQueueView(owned, "unassigned", "", NOW).caughtUp).toBe(false);
	expect(buildQueueView(owned, "unassigned", "zzz", NOW).allAssigned).toBe(false);
	expect(buildQueueView([], "unassigned", "", NOW).allAssigned).toBe(false);
	expect(buildQueueView(office, "unassigned", "", NOW).allAssigned).toBe(false);
	expect(buildQueueView(owned, "yourTurn", "", NOW).allAssigned).toBe(false);
});

// Spec #160 / ADR 0022: a manager's Waiting now lists Unassigned leads first.
test("a manager's Waiting now: Unassigned Your-turn leads first, then the rest, each in queue order", () => {
	expect(names(waitingNow(office, { manager: true }, NOW))).toEqual([
		// Unassigned, in queue order: active oldest first, then quiet. The answered lead isn't waiting.
		"Older",
		"New",
		"Quiet",
		// Then the rest, in the same order.
		"OwnedLong",
		"OwnedRecent",
		"OwnedQuiet",
	]);
});

test("an agent's Waiting now is the queue's order, owner aside", () => {
	expect(names(waitingNow(office, { manager: false }, NOW))).toEqual([
		"OwnedLong",
		"Older",
		"New",
		"OwnedRecent",
		"OwnedQuiet",
		"Quiet",
	]);
});
