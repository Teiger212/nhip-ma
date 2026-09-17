import { expect, test } from "vitest";

import { buildQueueView, inView, isInboxView, nextSelection } from "./queue";
import type { Conversation } from "./types";

function conv(
	partial: Partial<Conversation> & Pick<Conversation, "id" | "guestName">,
): Conversation {
	return {
		pipe: "zalo",
		guestId: partial.id,
		ownerUserId: null,
		messages: [
			{
				id: `${partial.id}:1`,
				direction: "in",
				source: "guest",
				text: `hello from ${partial.guestName}`,
				at: partial.lastGuestInboundAt ?? "2026-09-01T00:00:00.000Z",
				vendorMessageId: null,
			},
		],
		lastGuestInboundAt: "2026-09-01T00:00:00.000Z",
		sentAt: null,
		oneShot: null,
		updatedAt: "2026-09-01T00:00:00.000Z",
		...partial,
	};
}

const minji = conv({
	id: "wa:minji",
	guestName: "Minji",
	lastGuestInboundAt: "2026-09-03T08:00:00.000Z",
	updatedAt: "2026-09-03T08:00:00.000Z",
});
const yuki = conv({
	id: "wa:yuki",
	guestName: "Yuki",
	lastGuestInboundAt: "2026-09-01T08:00:00.000Z",
	updatedAt: "2026-09-01T08:00:00.000Z",
});
const alexei = conv({
	id: "wa:alexei",
	guestName: "Alexei",
	lastGuestInboundAt: "2026-09-02T08:00:00.000Z",
	sentAt: "2026-09-04T08:00:00.000Z",
	updatedAt: "2026-09-04T08:00:00.000Z",
});
const all = [minji, yuki, alexei];

test("needs reply is the default queue, oldest waiting guest first", () => {
	const q = buildQueueView(all, "needsReply", "");
	expect(q.visible.map((c) => c.guestName)).toEqual(["Yuki", "Minji"]);
	expect(q.counts).toEqual({ needsReply: 2, sent: 1, all: 3 });
	expect(q.caughtUp).toBe(false);
});

test("sent and all views order by most recent activity", () => {
	expect(buildQueueView(all, "sent", "").visible.map((c) => c.guestName)).toEqual(["Alexei"]);
	expect(buildQueueView(all, "all", "").visible.map((c) => c.guestName)).toEqual([
		"Alexei",
		"Minji",
		"Yuki",
	]);
});

test("tab counts follow the search so they agree with the list", () => {
	const q = buildQueueView(all, "needsReply", "yuki");
	expect(q.visible.map((c) => c.guestName)).toEqual(["Yuki"]);
	expect(q.counts).toEqual({ needsReply: 1, sent: 0, all: 1 });
	expect(q.caughtUp).toBe(false);
});

test("caught up only when the queue is empty with no search and threads exist", () => {
	expect(buildQueueView([alexei], "needsReply", "").caughtUp).toBe(true);
	expect(buildQueueView([alexei], "needsReply", "zzz").caughtUp).toBe(false);
	expect(buildQueueView([], "needsReply", "").caughtUp).toBe(false);
	expect(buildQueueView([alexei], "sent", "").caughtUp).toBe(false);
});

test("selection stays when visible, otherwise advances to the first visible thread", () => {
	const before = buildQueueView(all, "needsReply", "").visible;
	expect(nextSelection(before, "wa:minji")).toBe("wa:minji");
	const afterSend = buildQueueView(
		all.map((c) => (c.id === "wa:yuki" ? { ...c, sentAt: "2026-09-05T00:00:00.000Z" } : c)),
		"needsReply",
		"",
	).visible;
	expect(nextSelection(afterSend, "wa:yuki")).toBe("wa:minji");
	expect(nextSelection([], "wa:yuki")).toBeNull();
	expect(nextSelection(before, null)).toBe("wa:yuki");
});

test("view membership and parsing", () => {
	expect(inView(minji, "needsReply")).toBe(true);
	expect(inView(alexei, "needsReply")).toBe(false);
	expect(inView(alexei, "sent")).toBe(true);
	expect(inView(alexei, "all")).toBe(true);
	expect(isInboxView("sent")).toBe(true);
	expect(isInboxView("drafts")).toBe(false);
});
