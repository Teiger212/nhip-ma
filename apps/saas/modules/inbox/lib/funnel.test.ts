import { Funnel, conversationId } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { testInboxStore } from "./test-store";

/**
 * The funnel (ADR 0002) counted from Answers (ADR 0011): a lead is a guest who first
 * wrote in during the window; engaged is a lead with a `sent` Answer; in conversation is
 * a lead who wrote again after that send; response time is first inbound to first sent
 * Answer. Everything is scoped to the viewer's office.
 */

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const viewer = { userId: "agent-1", officeId: OFFICE };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const inbound = (guestId: string, at: number, text = "Xin chào") => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text,
	vendorMessageId: null,
	at,
});

type Store = Awaited<ReturnType<typeof testInboxStore>>;

/** Approve and deliver in one go: the happy path of an Answer (ADR 0011). */
async function sent(store: Store, id: string, inboundId: string) {
	const begun = await store.beginAnswer({
		conversationId: id,
		inboundId,
		text: "Reply",
		operatorId: "agent-1",
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	await store.completeAnswer(begun.answer.id, {
		mock: true,
		pipe: "zalo",
		to: id.split(":").at(-1) ?? "",
		vendorMessageId: `mock-${inboundId}`,
	});
}

/** Approve, then let the vendor refuse or go silent: the Answer never counts as received. */
async function notSent(store: Store, id: string, inboundId: string, how: "failed" | "unknown") {
	const begun = await store.beginAnswer({
		conversationId: id,
		inboundId,
		text: "Reply",
		operatorId: "agent-1",
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	if (how === "failed") {
		await store.failAnswer(begun.answer.id, "vendor refused");
	} else {
		await store.markAnswerUnknown(begun.answer.id, "timeout");
	}
}

async function lastInboundId(store: Store, id: string): Promise<string> {
	const conversation = await store.getConversation(id);
	const message = conversation?.messages.filter((m) => m.direction === "in").at(-1);
	if (!message) throw new Error(`no inbound on ${id}`);
	return message.id;
}

test("the funnel counts leads, engaged and in conversation for one office in the window", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	const since = now - 30 * DAY;

	// Minji: wrote in, was answered, wrote back after the send (the store stamps the send
	// with the real clock, so the write-back is dated a minute ahead). Lead, engaged, in
	// conversation.
	await store.upsertInbound(inbound("minji", now - 3 * DAY), OFFICE);
	const minji = conversationId(OFFICE, "zalo", "minji");
	await sent(store, minji, await lastInboundId(store, minji));
	await store.upsertInbound(inbound("minji", now + MINUTE, "Cảm ơn"), OFFICE);

	// Yuki: wrote in, was answered, never wrote back. Lead, engaged.
	await store.upsertInbound(inbound("yuki", now - 2 * DAY), OFFICE);
	const yuki = conversationId(OFFICE, "zalo", "yuki");
	await sent(store, yuki, await lastInboundId(store, yuki));

	// Alexei: wrote in twice, nobody answered. Two guest messages are not an exchange.
	await store.upsertInbound(inbound("alexei", now - 2 * DAY), OFFICE);
	await store.upsertInbound(inbound("alexei", now - 1 * DAY, "Hello?"), OFFICE);

	// Thảo: the send failed, then a later approval's outcome is unknown. Never received.
	await store.upsertInbound(inbound("thao", now - 2 * DAY), OFFICE);
	const thao = conversationId(OFFICE, "zalo", "thao");
	await notSent(store, thao, await lastInboundId(store, thao), "failed");
	await store.upsertInbound(inbound("thao", now - 1 * DAY, "Still here"), OFFICE);
	await notSent(store, thao, await lastInboundId(store, thao), "unknown");

	// Old: first wrote in 40 days ago, answered and wrote back inside the window. Not a lead
	// of this window: the cohort is by first contact, so the funnel narrows monotonically.
	await store.upsertInbound(inbound("old", now - 40 * DAY), OFFICE);
	const old = conversationId(OFFICE, "zalo", "old");
	await sent(store, old, await lastInboundId(store, old));
	await store.upsertInbound(inbound("old", now + MINUTE, "Back again"), OFFICE);

	// Another office's guest, answered and back: invisible here.
	await store.upsertInbound(inbound("elsewhere", now - 2 * DAY), OTHER_OFFICE);
	const elsewhere = conversationId(OTHER_OFFICE, "zalo", "elsewhere");
	await sent(store, elsewhere, await lastInboundId(store, elsewhere));
	await store.upsertInbound(inbound("elsewhere", now + MINUTE, "Back"), OTHER_OFFICE);

	const funnel = await store.funnel(viewer, { since: new Date(since) });
	expect(Funnel.parse(funnel)).toEqual(funnel);
	expect(funnel).toMatchObject({ leadsIn: 4, engaged: 2, inConversation: 1 });
	expect(funnel.since).toBe(new Date(since).toISOString());

	const other = await store.funnel(
		{ userId: "agent-2", officeId: OTHER_OFFICE },
		{ since: new Date(since) },
	);
	expect(other).toMatchObject({ leadsIn: 1, engaged: 1, inConversation: 1 });
	await store.close();
});

test("response time is first inbound to first sent Answer, median and p90 over answered leads", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	// Five answered leads. Each first wrote in N minutes ago and is answered now, so the
	// durations are about 10, 20, 30, 40 and 90 minutes; nearest-rank median is 30, p90 is 90.
	for (const [guest, minutes] of [
		["a", 10],
		["b", 20],
		["c", 30],
		["d", 40],
		["e", 90],
	] as const) {
		await store.upsertInbound(inbound(guest, now - minutes * MINUTE), OFFICE);
		const id = conversationId(OFFICE, "zalo", guest);
		await sent(store, id, await lastInboundId(store, id));
	}
	// An unanswered lead has no response time and does not drag the numbers.
	await store.upsertInbound(inbound("f", now - 5 * DAY), OFFICE);

	const funnel = await store.funnel(viewer, { since: new Date(now - 30 * DAY) });
	expect(funnel.leadsIn).toBe(6);
	expect(funnel.responseTime).not.toBeNull();
	const { answered, medianMs, p90Ms } = funnel.responseTime ?? {
		answered: 0,
		medianMs: 0,
		p90Ms: 0,
	};
	expect(answered).toBe(5);
	// The sends happened "now", a few milliseconds after `now` was read.
	expect(Math.abs(medianMs - 30 * MINUTE)).toBeLessThan(5_000);
	expect(Math.abs(p90Ms - 90 * MINUTE)).toBeLessThan(5_000);
	await store.close();
});

test("an office with nobody answered has no response time, and an empty window is all zeros", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	await store.upsertInbound(inbound("quiet", now - 1 * DAY), OFFICE);
	const funnel = await store.funnel(viewer, { since: new Date(now - 30 * DAY) });
	expect(funnel).toMatchObject({ leadsIn: 1, engaged: 0, inConversation: 0, responseTime: null });

	const empty = await store.funnel(viewer, { since: new Date(now) });
	expect(empty).toMatchObject({ leadsIn: 0, engaged: 0, inConversation: 0, responseTime: null });
	await store.close();
});
