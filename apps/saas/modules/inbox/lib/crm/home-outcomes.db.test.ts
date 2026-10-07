import type { CrmOutcomeStatus, InboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { guestMessage } from "../test-fixtures";
import { testDb, testInboxStore } from "../test-store";

/**
 * Home's Closings and Lost (ADR 0003, spec #59 stories 30 and 31, #68): distinct won and lost
 * leads of the window's cohort, read from the outcomes Nhịp cached on the office's threads,
 * never from the CRM; "as of" the last time Nhịp heard from the CRM (a lead written or found,
 * or a won or lost outcome first seen). An office with no CRM has none of it.
 */

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let store: InboxStore;
afterEach(async () => {
	await store?.close();
});

/** A guest's first message at `at`, on `pipe`; the thread's id. */
async function guestWrites(
	officeId: string,
	guestId: string,
	at: number,
	pipe: "zalo" | "whatsapp" = "zalo",
): Promise<string> {
	const { conversation } = await store.upsertInbound(
		guestMessage(guestId, { pipe, at, text: "Xin chào" }),
		officeId,
	);
	return conversation.id;
}

/** Nhịp links the thread to the CRM's lead, as the CRM sync does once the lead is written. */
async function link(officeId: string, conversationId: string, leadId: string): Promise<void> {
	expect(await store.claimCrmLink(officeId, conversationId, new Date(0))).toBe(true);
	await store.completeCrmLink(officeId, conversationId, {
		leadId,
		leadName: leadId,
		method: "created",
	});
}

/** The CRM told Nhịp the lead's outcome, first seen at `observedAt`. */
async function outcome(
	officeId: string,
	conversationId: string,
	leadId: string,
	status: CrmOutcomeStatus,
	observedAt: Date | null,
): Promise<void> {
	await store.saveCrmOutcome(officeId, conversationId, leadId, {
		outcome: status,
		outcomeAt: null,
		outcomeReason: null,
		outcomeObservedAt: observedAt?.toISOString() ?? null,
	});
}

test("an office with no CRM has no Closings and Lost, whatever its threads", async () => {
	store = await testInboxStore();
	await guestWrites(OFFICE, "minji", Date.now() - DAY);
	expect(
		await store.crmOutcomes({ userId: "agent-1", officeId: OFFICE }, { since: new Date(0) }),
	).toBeNull();
});

test("an office on a CRM that has heard nothing yet counts zero, with no 'as of'", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	await guestWrites(OFFICE, "minji", Date.now() - DAY);
	expect(
		await store.crmOutcomes({ userId: "agent-1", officeId: OFFICE }, { since: new Date(0) }),
	).toEqual({ closings: 0, lost: 0, asOf: null });
});

test("Closings and Lost count distinct won and lost leads of the cohort, as of the last word", async () => {
	store = await testInboxStore();
	const now = Date.now();
	const since = new Date(now - 30 * DAY);
	await store.setCrmConnection(OFFICE, "mock");
	await store.setCrmConnection(OTHER_OFFICE, "mock");

	// Minji wrote on Zalo and on WhatsApp: two threads, one lead, won. One closing (story 31).
	const minjiZalo = await guestWrites(OFFICE, "minji", now - 3 * DAY);
	const minjiWhatsApp = await guestWrites(OFFICE, "84900000001", now - 2 * DAY, "whatsapp");
	await link(OFFICE, minjiZalo, "lead-minji");
	await link(OFFICE, minjiWhatsApp, "lead-minji");
	const minjiWon = new Date(now - DAY);
	await outcome(OFFICE, minjiZalo, "lead-minji", "won", minjiWon);
	await outcome(OFFICE, minjiWhatsApp, "lead-minji", "won", minjiWon);

	// Yuki: won. Alexei: lost. Thảo: still open. Linh: written, nothing heard yet.
	const yuki = await guestWrites(OFFICE, "yuki", now - 4 * DAY);
	await link(OFFICE, yuki, "lead-yuki");
	await outcome(OFFICE, yuki, "lead-yuki", "won", new Date(now - 2 * DAY));
	const alexei = await guestWrites(OFFICE, "alexei", now - 5 * DAY);
	await link(OFFICE, alexei, "lead-alexei");
	const lastWord = new Date(now - 10 * MINUTE);
	await outcome(OFFICE, alexei, "lead-alexei", "lost", lastWord);
	const thao = await guestWrites(OFFICE, "thao", now - 5 * DAY);
	await link(OFFICE, thao, "lead-thao");
	await outcome(OFFICE, thao, "lead-thao", "open", null);
	await guestWrites(OFFICE, "linh", now - 5 * DAY);

	// Old: first wrote 40 days ago, won since: not a lead of this window.
	const old = await guestWrites(OFFICE, "old", now - 40 * DAY);
	await link(OFFICE, old, "lead-old");
	await outcome(OFFICE, old, "lead-old", "won", new Date(now - DAY));

	// Another office's won lead: invisible here.
	const elsewhere = await guestWrites(OTHER_OFFICE, "elsewhere", now - DAY);
	await link(OTHER_OFFICE, elsewhere, "lead-elsewhere");
	await outcome(OTHER_OFFICE, elsewhere, "lead-elsewhere", "won", new Date(now));

	const counted = await store.crmOutcomes({ userId: "agent-1", officeId: OFFICE }, { since });
	expect(counted?.closings).toBe(2);
	expect(counted?.lost).toBe(1);
	// The last word: the latest of a lead written (Linh's none) and an outcome first seen.
	const asOf = Date.parse(counted?.asOf ?? "");
	expect(asOf).toBeGreaterThanOrEqual(lastWord.getTime());
	expect(asOf).toBeLessThanOrEqual(Date.now());
});

test("a lead whose threads disagree counts once, by the outcome Nhịp saw last", async () => {
	store = await testInboxStore();
	const now = Date.now();
	await store.setCrmConnection(OFFICE, "mock");
	const first = await guestWrites(OFFICE, "minji", now - 3 * DAY);
	const second = await guestWrites(OFFICE, "84900000001", now - 2 * DAY, "whatsapp");
	await link(OFFICE, first, "lead-minji");
	await link(OFFICE, second, "lead-minji");
	await outcome(OFFICE, first, "lead-minji", "lost", new Date(now - 2 * DAY));
	await outcome(OFFICE, second, "lead-minji", "won", new Date(now - DAY));

	expect(
		await store.crmOutcomes(
			{ userId: "agent-1", officeId: OFFICE },
			{ since: new Date(now - 30 * DAY) },
		),
	).toMatchObject({ closings: 1, lost: 0 });
});

test("a deleted guest's won or lost lead stays in Closings and Lost, as their lead tally", async () => {
	store = await testInboxStore();
	const now = Date.now();
	await store.setCrmConnection(OFFICE, "mock");
	// What deleting a guest leaves (ADR 0020): their numbers, with the outcome Nhịp last heard.
	const tally = (id: string, daysAgo: number, status: CrmOutcomeStatus | null) =>
		testDb.leadTally.create({
			data: {
				id,
				officeId: OFFICE,
				pipe: "zalo",
				firstInboundAt: new Date(now - daysAgo * DAY),
				inConversation: false,
				outcome: status,
			},
		});
	await tally("won-in-window", 3, "won");
	await tally("lost-in-window", 3, "lost");
	await tally("open-in-window", 3, "open");
	await tally("won-before-window", 40, "won");

	expect(
		await store.crmOutcomes(
			{ userId: "agent-1", officeId: OFFICE },
			{ since: new Date(now - 30 * DAY) },
		),
	).toMatchObject({ closings: 1, lost: 1 });
});
