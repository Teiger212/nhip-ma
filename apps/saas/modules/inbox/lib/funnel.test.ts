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
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The office's time zone; Ho Chi Minh City is UTC+7 all year. */
const TZ = "Asia/Ho_Chi_Minh";
const HCM_OFFSET = 7 * HOUR;
/** The calendar day of an instant read in UTC, or in Ho Chi Minh City with the offset added. */
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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

	const funnel = await store.funnel(viewer, {
		since: new Date(since),
		countMock: true,
		timeZone: TZ,
	});
	expect(Funnel.parse(funnel)).toEqual(funnel);
	expect(funnel).toMatchObject({ leadsIn: 4, engaged: 2, inConversation: 1 });
	expect(funnel.since).toBe(new Date(since).toISOString());

	const other = await store.funnel(
		{ userId: "agent-2", officeId: OTHER_OFFICE },
		{ since: new Date(since), countMock: true, timeZone: TZ },
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

	const funnel = await store.funnel(viewer, {
		since: new Date(now - 30 * DAY),
		countMock: true,
		timeZone: TZ,
	});
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
	const funnel = await store.funnel(viewer, {
		since: new Date(now - 30 * DAY),
		countMock: true,
		timeZone: TZ,
	});
	expect(funnel).toMatchObject({ leadsIn: 1, engaged: 0, inConversation: 0, responseTime: null });

	const empty = await store.funnel(viewer, { since: new Date(now), countMock: true, timeZone: TZ });
	expect(empty).toMatchObject({ leadsIn: 0, engaged: 0, inConversation: 0, responseTime: null });
	await store.close();
});

test("a reply from the vendor's own app reaches the lead, and the earliest reply sets the time", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	await store.upsertInbound(inbound("phone", now - 60 * MINUTE), OFFICE);
	await store.upsertInbound(
		{ ...inbound("phone", now - 50 * MINUTE, "Da, em gui anh can nay"), source: "oa-echo" },
		OFFICE,
	);
	const both = conversationId(OFFICE, "zalo", "both");
	await store.upsertInbound(inbound("both", now - 60 * MINUTE), OFFICE);
	await store.upsertInbound(
		{ ...inbound("both", now - 30 * MINUTE, "from the phone"), source: "oa-echo" },
		OFFICE,
	);
	await sent(store, both, await lastInboundId(store, both));

	const funnel = await store.funnel(viewer, {
		since: new Date(now - DAY),
		countMock: true,
		timeZone: TZ,
	});
	expect(funnel).toMatchObject({ leadsIn: 2, engaged: 2 });
	// "phone" answered in 10 minutes from the app; "both" first answered from the app at 30.
	expect(funnel.responseTime).toMatchObject({
		answered: 2,
		medianMs: 10 * MINUTE,
		p90Ms: 30 * MINUTE,
	});
	await store.close();
});

test("a live deployment's funnel leaves mock sends out", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	const id = conversationId(OFFICE, "zalo", "mocked");
	await store.upsertInbound(inbound("mocked", now - 60 * MINUTE), OFFICE);
	await sent(store, id, await lastInboundId(store, id));

	const demo = await store.funnel(viewer, {
		since: new Date(now - DAY),
		countMock: true,
		timeZone: TZ,
	});
	const live = await store.funnel(viewer, {
		since: new Date(now - DAY),
		countMock: false,
		timeZone: TZ,
	});
	expect(demo).toMatchObject({ leadsIn: 1, engaged: 1 });
	expect(live).toMatchObject({ leadsIn: 1, engaged: 0, responseTime: null });
	await store.close();
});

test("leads by day count each lead on the office's local day of first contact, every day of the window listed (ADR 0002)", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	// D is yesterday in UTC, from its midnight.
	const d = Math.floor(now / DAY) * DAY - DAY;
	// The window opens at local midnight of D-1 in Ho Chi Minh City: 17:00 UTC on D-2.
	const since = d - DAY - HCM_OFFSET;

	// 16:30 UTC on D is 23:30 on D in Ho Chi Minh City.
	await store.upsertInbound(inbound("evening", d + 16 * HOUR + 30 * MINUTE), OFFICE);
	// 23:30 UTC on D is 06:30 on D+1 locally: the next local day, though the same UTC day.
	await store.upsertInbound(inbound("late", d + 23 * HOUR + 30 * MINUTE), OFFICE);
	// First wrote at 01:00 on D+1 locally, wrote again now: counted once, on first contact.
	await store.upsertInbound(inbound("twice", d + 18 * HOUR), OFFICE);
	await store.upsertInbound(inbound("twice", now, "Again"), OFFICE);
	// 23:59 locally the evening before the window opened: not a lead of this window.
	await store.upsertInbound(inbound("before", since - MINUTE), OFFICE);
	// Another office's guest on D: invisible here, counted there.
	await store.upsertInbound(inbound("elsewhere", d + 16 * HOUR + 30 * MINUTE), OTHER_OFFICE);

	const funnel = await store.funnel(viewer, {
		since: new Date(since),
		countMock: true,
		timeZone: TZ,
	});
	expect(Funnel.parse(funnel)).toEqual(funnel);

	// Every local day from D-1 through today in Ho Chi Minh City, zeros included.
	const expected: Array<{ day: string; leads: number }> = [];
	const leadsOn: Record<string, number> = { [dayOf(d)]: 1, [dayOf(d + DAY)]: 2 };
	for (let at = d - DAY; dayOf(at) <= dayOf(now + HCM_OFFSET); at += DAY) {
		expected.push({ day: dayOf(at), leads: leadsOn[dayOf(at)] ?? 0 });
	}
	expect(funnel.byDay).toEqual(expected);
	expect(funnel.leadsIn).toBe(3);

	const other = await store.funnel(
		{ userId: "agent-2", officeId: OTHER_OFFICE },
		{ since: new Date(since), countMock: true, timeZone: TZ },
	);
	expect(other.byDay.filter((entry) => entry.leads > 0)).toEqual([{ day: dayOf(d), leads: 1 }]);
	await store.close();
});

test("leads by day over the 30-day window add up to leads in (ADR 0002)", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	// Local midnight in Ho Chi Minh City 29 days before today: 30 local days including today.
	const since = Date.parse(`${dayOf(now + HCM_OFFSET)}T00:00:00+07:00`) - 29 * DAY;
	for (const [guest, ago] of [
		["a", 1 * HOUR],
		["b", 2 * DAY],
		["c", 2 * DAY + HOUR],
		["d", 15 * DAY],
		["e", 28 * DAY],
	] as const) {
		await store.upsertInbound(inbound(guest, now - ago), OFFICE);
	}
	await store.upsertInbound(inbound("old", since - HOUR), OFFICE);

	const funnel = await store.funnel(viewer, {
		since: new Date(since),
		countMock: true,
		timeZone: TZ,
	});
	expect(funnel.byDay).toHaveLength(30);
	expect(funnel.byDay.reduce((sum, entry) => sum + entry.leads, 0)).toBe(funnel.leadsIn);
	expect(funnel.leadsIn).toBe(5);
	await store.close();
});

test("the response-time spread puts each answered lead in one band, a boundary in the slower band (CONTEXT.md Response time)", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	const first = now - 3 * HOUR;
	// Replies from the vendor's own app carry exact timestamps, so the durations are exact.
	for (const [guest, after] of [
		["quick", 5 * MINUTE - 1],
		["five", 5 * MINUTE],
		["fifteen", 15 * MINUTE],
		["almost", 60 * MINUTE - 1],
		["hour", 60 * MINUTE],
		["slow", 2 * HOUR],
	] as const) {
		await store.upsertInbound(inbound(guest, first), OFFICE);
		await store.upsertInbound(
			{ ...inbound(guest, first + after, "Da, em gui anh"), source: "oa-echo" },
			OFFICE,
		);
	}
	await store.upsertInbound(inbound("unanswered", first), OFFICE);
	// Another office's quick reply stays in its own spread.
	await store.upsertInbound(inbound("elsewhere", first), OTHER_OFFICE);
	await store.upsertInbound(
		{ ...inbound("elsewhere", first + MINUTE, "Hi"), source: "oa-echo" },
		OTHER_OFFICE,
	);

	const funnel = await store.funnel(viewer, {
		since: new Date(now - DAY),
		countMock: true,
		timeZone: TZ,
	});
	expect(funnel.responseTime).toMatchObject({
		answered: 6,
		buckets: { under5m: 1, from5to15m: 1, from15to60m: 2, over60m: 2 },
	});
	await store.close();
});

test("the response-time spread accounts for every answered lead and nobody else (CONTEXT.md Response time)", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	// Answered through Nhịp now: about 3, 10, 40 and 90 minutes after first contact.
	for (const [guest, minutes] of [
		["a", 3],
		["b", 10],
		["c", 40],
		["d", 90],
	] as const) {
		await store.upsertInbound(inbound(guest, now - minutes * MINUTE), OFFICE);
		const id = conversationId(OFFICE, "zalo", guest);
		await sent(store, id, await lastInboundId(store, id));
	}
	// Answered from the phone, and two never answered.
	await store.upsertInbound(inbound("phone", now - HOUR), OFFICE);
	await store.upsertInbound(
		{ ...inbound("phone", now - HOUR + 20 * MINUTE, "from the phone"), source: "oa-echo" },
		OFFICE,
	);
	await store.upsertInbound(inbound("quiet", now - 2 * HOUR), OFFICE);
	await store.upsertInbound(inbound("silent", now - 3 * HOUR), OFFICE);

	const funnel = await store.funnel(viewer, {
		since: new Date(now - DAY),
		countMock: true,
		timeZone: TZ,
	});
	const buckets = funnel.responseTime?.buckets;
	expect(buckets).toBeDefined();
	const spread = Object.values(buckets ?? {}).reduce((sum, count) => sum + count, 0);
	expect(funnel.engaged).toBe(5);
	expect(funnel.responseTime?.answered).toBe(5);
	expect(spread).toBe(5);
	await store.close();
});
