import { conversationId } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { testInboxStore } from "./test-store";

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const inbound = (guestId: string, pipe: "whatsapp" | "zalo" = "whatsapp") => ({
	pipe,
	source: "guest" as const,
	guestId,
	guestName: null,
	text: "Xin chào",
	vendorMessageId: null,
});

test("an office has at most one CRM connection, and clearing it removes it", async () => {
	const store = await testInboxStore();
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	await store.setCrmConnection(OFFICE, "mock");
	expect(await store.getCrmConnection(OFFICE)).toEqual({ kind: "mock" });
	await store.setCrmConnection(OFFICE, null);
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	await store.close();
});

test("a link and its outcome ride on the conversation", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	const checkedAt = new Date("2026-09-27T10:00:00Z");
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId: "lead-1",
		leadName: "Minji Park",
		method: "phone",
		checkedAt,
	});
	await store.saveCrmOutcomes(
		[
			{
				conversationId: id,
				outcome: "won",
				outcomeAt: new Date("2026-09-26T09:00:00Z"),
				outcomeReason: null,
			},
		],
		checkedAt,
	);
	const conv = await store.getConversation(id);
	expect(conv?.crm).toEqual({
		kind: "mock",
		leadId: "lead-1",
		leadName: "Minji Park",
		method: "phone",
		outcome: "won",
		outcomeAt: "2026-09-26T09:00:00.000Z",
		outcomeReason: null,
		checkedAt: "2026-09-27T10:00:00.000Z",
	});
	await store.close();
});

test("relinking to another lead clears the old outcome", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "g1");
	const at = new Date();
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId: "a",
		leadName: "A",
		method: "manual",
		checkedAt: at,
	});
	await store.saveCrmOutcomes(
		[{ conversationId: id, outcome: "lost", outcomeAt: at, outcomeReason: "price" }],
		at,
	);
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId: "b",
		leadName: "B",
		method: "manual",
		checkedAt: at,
	});
	expect((await store.getConversation(id))?.crm).toMatchObject({
		leadId: "b",
		outcome: null,
		outcomeReason: null,
	});
	await store.close();
});

test("crm work lists unlinked and stale threads of the office only", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("fresh"), OFFICE);
	await store.upsertInbound(inbound("stale"), OFFICE);
	await store.upsertInbound(inbound("never"), OFFICE);
	await store.upsertInbound(inbound("elsewhere"), OTHER_OFFICE);
	const now = new Date("2026-09-27T10:00:00Z");
	const old = new Date("2026-09-27T09:00:00Z");
	await store.saveCrmLink(conversationId(OFFICE, "whatsapp", "fresh"), {
		kind: "mock",
		leadId: "f",
		leadName: "F",
		method: "phone",
		checkedAt: now,
	});
	await store.saveCrmLink(conversationId(OFFICE, "whatsapp", "stale"), {
		kind: "mock",
		leadId: "s",
		leadName: "S",
		method: "phone",
		checkedAt: old,
	});
	const work = await store.crmWork(OFFICE, new Date("2026-09-27T09:50:00Z"));
	expect(work.map((item) => item.guestId).sort()).toEqual(["never", "stale"]);
	await store.close();
});

test("mock leads are found by phone, by query, and by id, inside the office", async () => {
	const store = await testInboxStore();
	await store.upsertMockCrmLead({
		id: "m1",
		officeId: OFFICE,
		name: "Minji Park",
		phone: "+84901234567",
		outcome: "open",
		outcomeAt: null,
		outcomeReason: null,
	});
	await store.upsertMockCrmLead({
		id: "m2",
		officeId: OTHER_OFFICE,
		name: "Minji Other",
		phone: "+84901234567",
		outcome: "open",
		outcomeAt: null,
		outcomeReason: null,
	});
	expect(
		(await store.findMockCrmLeads(OFFICE, { phone: "+84901234567" })).map((l) => l.id),
	).toEqual(["m1"]);
	expect((await store.findMockCrmLeads(OFFICE, { query: "minji" })).map((l) => l.id)).toEqual([
		"m1",
	]);
	expect((await store.findMockCrmLeads(OFFICE, { ids: ["m1", "m2"] })).map((l) => l.id)).toEqual([
		"m1",
	]);
	await store.close();
});

test("deleting an office deletes its CRM connection, links and mock leads", async () => {
	const store = await testInboxStore();
	await store.setCrmConnection(OTHER_OFFICE, "mock");
	await store.upsertMockCrmLead({
		id: "gone",
		officeId: OTHER_OFFICE,
		name: "G",
		phone: null,
		outcome: "open",
		outcomeAt: null,
		outcomeReason: null,
	});
	const { testDb } = await import("./test-store");
	await testDb.organization.delete({ where: { id: OTHER_OFFICE } });
	expect(await store.getCrmConnection(OTHER_OFFICE)).toBeNull();
	expect(await testDb.mockCrmLead.count({ where: { officeId: OTHER_OFFICE } })).toBe(0);
	await store.close();
});
