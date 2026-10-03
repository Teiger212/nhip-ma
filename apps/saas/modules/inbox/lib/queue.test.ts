import { expect, test } from "vitest";

import {
	buildQueueView,
	inView,
	inQueue,
	isInboxView,
	isQuiet,
	isResolved,
	threadStatus,
	nextSelection,
	QUIET_AFTER_MS,
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
	expect(q.counts).toEqual({ yourTurn: 3, sent: 1, all: 4 });
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
	expect(q.counts).toEqual({ yourTurn: 1, sent: 0, all: 1 });
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

test("view parsing", () => {
	expect(isInboxView("sent")).toBe(true);
	expect(isInboxView("yourTurn")).toBe(true);
	expect(isInboxView("needsReply")).toBe(false);
});

/** A linked lead whose outcome Nhịp observed at `observedAt`; the CRM dates it `outcomeAt`. */
const crm = (
	outcome: "open" | "won" | "lost",
	observedAt: string,
	outcomeAt: string = observedAt,
): ConversationCrm => ({
	kind: "mock",
	leadId: "lead-1",
	leadName: "Lead",
	method: "phone",
	outcome,
	outcomeAt,
	outcomeReason: null,
	outcomeObservedAt: outcome === "open" ? null : observedAt,
	checkedAt: observedAt,
});

// CONTEXT "Resolved": the CRM reports won or lost; it leaves the queue, visible under Sent / All.
test("a won or lost lead leaves the queue and shows under Sent and All", () => {
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
	const queue = buildQueueView([lost, open], "yourTurn", "", NOW);
	expect(queue.visible.map((c) => c.id)).toEqual(["open"]);
	expect(queue.counts).toEqual({ yourTurn: 1, sent: 1, all: 2 });
	expect(buildQueueView([lost, open], "sent", "", NOW).visible.map((c) => c.id)).toEqual(["lost"]);
	expect(buildQueueView([lost, open], "all", "", NOW).visible).toHaveLength(2);
});

// CONTEXT "Resolved": leaves the queue until the guest writes again.
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
test("a backdated close does not hide a guest who wrote before Nhịp saw it", () => {
	// The CRM dates the loss at 09:00; the guest wrote at 10:00; Nhịp saw the loss at 11:00.
	const backdated = conv({
		id: "backdated",
		guestName: "D",
		lastGuestInboundAt: "2026-09-04T10:00:00.000Z",
		crm: crm("lost", "2026-09-04T11:00:00.000Z", "2026-09-04T09:00:00.000Z"),
	});
	expect(isResolved(backdated)).toBe(true);
	expect(inQueue(backdated)).toBe(false);
});

test("an unlinked, unmatched or open thread is untouched by the CRM", () => {
	const plain = conv({ id: "plain", guestName: "P" });
	const miss = conv({
		id: "miss",
		guestName: "M",
		crm: { ...crm("lost", "2026-09-04T11:00:00.000Z"), leadId: null },
	});
	for (const thread of [plain, miss]) {
		expect(isResolved(thread)).toBe(false);
		expect(inQueue(thread)).toBe(true);
	}
});

// DESIGN.md "In the inbox": one status badge per thread; the CRM's outcome replaces the turn while resolved.
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
