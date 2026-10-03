import { conversationId, type InboxStore } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { buildQueueView, inQueue } from "./queue";
import { testDb, testInboxStore } from "./test-store";

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const MANAGER = { userId: "agent-1", officeId: OFFICE, role: "manager" as const };

const inbound = (guestId: string, at?: Date) => ({
	pipe: "whatsapp" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text: "Xin chào",
	vendorMessageId: null,
	...(at ? { at } : {}),
});

const mockLead = (id: string, officeId: string, name: string, phone: string | null) => ({
	id,
	officeId,
	name,
	phone,
	outcome: "open" as const,
	outcomeAt: null,
	outcomeReason: null,
});

async function linked(
	store: InboxStore,
	guestId: string,
	leadId: string,
	checkedAt: Date,
	officeId = OFFICE,
): Promise<string> {
	const id = conversationId(officeId, "whatsapp", guestId);
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId,
		leadName: leadId,
		method: "manual",
		checkedAt,
	});
	return id;
}

async function observe(
	store: InboxStore,
	id: string,
	outcome: "open" | "won" | "lost" | null,
	checkedAt: Date,
	outcomeAt: Date | null = checkedAt,
): Promise<void> {
	await store.saveCrmOutcomes(
		[{ conversationId: id, outcome, outcomeAt, outcomeReason: null }],
		checkedAt,
	);
}

// ADR 0003: one CRM per office, set by the platform admin.
test("an office has at most one CRM connection, and clearing it removes it", async () => {
	const store = await testInboxStore();
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	await store.setCrmConnection(OFFICE, "mock");
	expect(await store.getCrmConnection(OFFICE)).toEqual({ kind: "mock" });
	await store.setCrmConnection(OFFICE, null);
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	await store.close();
});

// ADR 0003: the thread's link and its cached outcome ride on the conversation.
test("a link and its outcome ride on the conversation, observed when Nhịp first saw it", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("84901234567"), OFFICE);
	const checkedAt = new Date("2026-09-27T10:00:00Z");
	const id = await linked(store, "84901234567", "lead-1", checkedAt);
	await observe(store, id, "won", checkedAt, new Date("2026-09-26T09:00:00Z"));
	expect((await store.getConversation(id))?.crm).toEqual({
		kind: "mock",
		leadId: "lead-1",
		leadName: "lead-1",
		method: "manual",
		outcome: "won",
		outcomeAt: "2026-09-26T09:00:00.000Z",
		outcomeReason: null,
		outcomeObservedAt: "2026-09-27T10:00:00.000Z",
		checkedAt: "2026-09-27T10:00:00.000Z",
	});
	await store.close();
});

// ADR 0003 (Q3): outcomeObservedAt is the time Nhịp first saw the current outcome.
test("the same outcome seen again keeps its first observation; a new one is observed anew; open clears it", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const first = new Date("2026-09-27T10:00:00Z");
	const later = new Date("2026-09-27T11:00:00Z");
	const latest = new Date("2026-09-27T12:00:00Z");
	const id = await linked(store, "g1", "lead-1", first);
	const observedAt = async () => (await store.getConversation(id))?.crm?.outcomeObservedAt;

	await observe(store, id, "lost", first);
	await observe(store, id, "lost", later);
	expect(await observedAt()).toBe(first.toISOString());

	await observe(store, id, "won", latest);
	expect(await observedAt()).toBe(latest.toISOString());

	await observe(store, id, "open", latest);
	expect(await observedAt()).toBeNull();
	await store.close();
});

test("relinking to another lead clears the old outcome", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const at = new Date();
	const id = await linked(store, "g1", "a", at);
	await observe(store, id, "lost", at);
	await linked(store, "g1", "b", at);
	expect((await store.getConversation(id))?.crm).toMatchObject({
		leadId: "b",
		outcome: null,
		outcomeAt: null,
		outcomeReason: null,
		outcomeObservedAt: null,
	});
	await store.close();
});

// ADR 0003: a background lookup never overwrites a manager's link made meanwhile.
test("a conditional link writes only over the link it read", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "g1");
	const read = new Date("2026-09-27T10:00:00Z");
	const phoneLink = {
		kind: "mock" as const,
		leadId: "by-phone",
		leadName: "P",
		method: "phone" as const,
		checkedAt: new Date("2026-09-27T10:05:00Z"),
	};
	// Read with no link; a manager links meanwhile; the lookup's write is refused.
	await linked(store, "g1", "by-hand", read);
	expect(await store.saveCrmLink(id, phoneLink, null)).toBe(false);
	// Read the manager's link; it changes again; the lookup's write is refused.
	await linked(store, "g1", "by-hand-2", new Date("2026-09-27T10:01:00Z"));
	expect(
		await store.saveCrmLink(id, phoneLink, { leadId: "by-hand", checkedAt: read.toISOString() }),
	).toBe(false);
	expect((await store.getConversation(id))?.crm?.leadId).toBe("by-hand-2");
	await store.close();
});

test("an outcome for a lead the thread no longer links is skipped", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const at = new Date();
	const id = await linked(store, "g1", "now-linked", at);
	await store.saveCrmOutcomes(
		[
			{
				conversationId: id,
				leadId: "old-lead",
				outcome: "lost",
				outcomeAt: at,
				outcomeReason: null,
			},
		],
		at,
	);
	expect((await store.getConversation(id))?.crm?.outcome).toBeNull();
	await store.close();
});

test("mock leads are found by phone, by query, and by id, inside the office", async () => {
	const store = await testInboxStore();
	await store.upsertMockCrmLead(mockLead("m1", OFFICE, "Minji Park", "+84901234567"));
	await store.upsertMockCrmLead(mockLead("m2", OTHER_OFFICE, "Minji Other", "+84901234567"));
	const ids = async (where: Parameters<InboxStore["findMockCrmLeads"]>[1]) =>
		(await store.findMockCrmLeads(OFFICE, where)).map((found) => found.id);
	expect(await ids({ phone: "+84901234567" })).toEqual(["m1"]);
	expect(await ids({ query: "minji" })).toEqual(["m1"]);
	expect(await ids({ ids: ["m1", "m2"] })).toEqual(["m1"]);
	await store.close();
});

test("deleting an office deletes its CRM connection, links and mock leads", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OTHER_OFFICE);
	await store.setCrmConnection(OTHER_OFFICE, "mock");
	await linked(store, "g1", "a", new Date(), OTHER_OFFICE);
	await store.upsertMockCrmLead(mockLead("gone", OTHER_OFFICE, "G", null));
	await testDb.organization.delete({ where: { id: OTHER_OFFICE } });
	expect(await store.getCrmConnection(OTHER_OFFICE)).toBeNull();
	expect(await testDb.crmLink.count({ where: { officeId: OTHER_OFFICE } })).toBe(0);
	expect(await testDb.mockCrmLead.count({ where: { officeId: OTHER_OFFICE } })).toBe(0);
	await store.close();
});

// ADR 0003: another CRM's leads mean nothing.
test("disconnecting or changing the office's CRM drops its thread links, and only its own", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	await store.upsertInbound(inbound("g2"), OTHER_OFFICE);
	const at = new Date();
	await store.setCrmConnection(OFFICE, "mock");
	await store.setCrmConnection(OTHER_OFFICE, "mock");
	const id = await linked(store, "g1", "a", at);
	const other = await linked(store, "g2", "b", at, OTHER_OFFICE);
	await store.setCrmConnection(OFFICE, "mock"); // same kind: links stay
	expect((await store.getConversation(id))?.crm?.leadId).toBe("a");
	await store.setCrmConnection(OFFICE, null);
	expect((await store.getConversation(id))?.crm).toBeNull();
	expect((await store.getConversation(other))?.crm?.leadId).toBe("b");
	await store.close();
});

// CONTEXT "Resolved" and ADR 0003 (Q3): the nav count (SQL) and the queue (rules) agree.
test("the summary carries the link, and the Your-turn count leaves resolved threads out until the guest writes after Nhịp saw the outcome", async () => {
	const store = await testInboxStore();
	const wrote = new Date("2026-09-27T09:30:00Z");
	for (const guest of ["won", "lost", "open", "unlinked", "backdated"]) {
		await store.upsertInbound(inbound(guest, wrote), OFFICE);
	}
	const seen = new Date("2026-09-27T10:00:00Z");
	await observe(store, await linked(store, "won", "lead-won", seen), "won", seen);
	await observe(store, await linked(store, "lost", "lead-lost", seen), "lost", seen);
	await linked(store, "open", "lead-open", seen);
	// Closed in the CRM at 09:00, before the guest wrote at 09:30; Nhịp saw it at 10:00.
	await observe(
		store,
		await linked(store, "backdated", "lead-backdated", seen),
		"lost",
		seen,
		new Date("2026-09-27T09:00:00Z"),
	);

	const agree = async (expected: string[]) => {
		const summaries = await store.listConversationSummaries(MANAGER);
		expect(
			summaries
				.filter(inQueue)
				.map((s) => s.guestId)
				.sort(),
		).toEqual(expected);
		expect(await store.countYourTurn(MANAGER)).toBe(
			buildQueueView(summaries, "yourTurn", "").counts.yourTurn,
		);
		return summaries;
	};

	const summaries = await agree(["open", "unlinked"]);
	expect(summaries.find((s) => s.guestId === "won")?.crm).toMatchObject({
		leadId: "lead-won",
		outcome: "won",
		outcomeObservedAt: seen.toISOString(),
	});
	expect(summaries.find((s) => s.guestId === "unlinked")?.crm).toBeNull();

	// The lost guest writes after Nhịp saw the outcome: back in the queue, in SQL and the rules alike.
	await store.upsertInbound(inbound("lost", new Date("2026-09-27T10:01:00Z")), OFFICE);
	await agree(["lost", "open", "unlinked"]);
	await store.close();
});
