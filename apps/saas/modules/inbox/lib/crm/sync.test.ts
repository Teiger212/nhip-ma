import type { InboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { testInboxStore } from "../test-store";
import { createCrmSync } from "./sync";

const OFFICE = "office-a";
const threadUrl = (id: string) => `https://nhip.test/vi/inbox?thread=${encodeURIComponent(id)}`;

let store: InboxStore;
afterEach(async () => {
	await store?.close();
});

async function guestWrites(pipe: "zalo" | "whatsapp", guestId: string, guestName: string | null) {
	return store.upsertInbound(
		{
			pipe,
			source: "guest",
			guestId,
			guestName,
			text: "Xin chào, tôi cần thuê căn hộ",
			vendorMessageId: null,
		},
		OFFICE,
	);
}

// Spec #59 stories 13, 14, 18 (#61): a new guest becomes a lead, Zalo id and thread link on it, no text.
test("a new Zalo guest becomes one lead in the office's CRM, linked to the thread", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo", "zalo-user-1", "Thảo Nguyễn");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	const leads = await store.findMockCrmLeads(OFFICE);
	expect(leads).toHaveLength(1);
	expect(leads[0]).toMatchObject({
		name: "Thảo Nguyễn",
		zaloUserId: "zalo-user-1",
		phone: null,
		pipe: "zalo",
		threadUrl: threadUrl(conversation.id),
	});
	expect(JSON.stringify(leads[0])).not.toContain("Xin chào");
	expect((await store.getConversation(conversation.id))?.crm).toEqual({
		leadId: leads[0].id,
		leadName: "Thảo Nguyễn",
		method: "created",
	});
});

// Spec #59 story 19 (#61): a burst of first messages is one lead.
test("two simultaneous first messages leave one lead in the CRM", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo", "zalo-user-2", "Minh");
	const sync = createCrmSync({ store, threadUrl });

	await Promise.all([
		sync.newGuest(conversation),
		sync.newGuest(conversation),
		sync.newGuest(conversation),
	]);

	expect(await store.findMockCrmLeads(OFFICE)).toHaveLength(1);
	expect((await store.getConversation(conversation.id))?.crm?.leadName).toBe("Minh");
});

const existingLead = (over: { phone?: string | null; zaloUserId?: string | null; name?: string }) =>
	store.createMockCrmLead({
		officeId: OFFICE,
		name: over.name ?? "Existing lead",
		phone: over.phone ?? null,
		zaloUserId: over.zaloUserId ?? null,
		pipe: "zalo",
		language: null,
		fields: null,
		threadUrl: "https://nhip.test/vi/inbox",
	});

// Spec #59 stories 16, 18 (#61): the guest's lead is reused by the Zalo id Nhịp stored on it.
test("a Zalo guest whose id is on a lead is linked to it, and no new lead is made", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const lead = await existingLead({ zaloUserId: "zalo-user-3", name: "Thảo (from last year)" });
	const conversation = await guestWrites("zalo", "zalo-user-3", "Thảo");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect((await store.findMockCrmLeads(OFFICE)).map((found) => found.id)).toEqual([lead.id]);
	expect((await store.getConversation(conversation.id))?.crm).toEqual({
		leadId: lead.id,
		leadName: "Thảo (from last year)",
		method: "zaloId",
	});
});

// #61's decision: two leads for one guest, neither is linked and none is added.
test("a guest matching two leads is linked to neither, and no lead is added", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	await existingLead({ zaloUserId: "zalo-user-4", name: "Copy one" });
	await existingLead({ zaloUserId: "zalo-user-4", name: "Copy two" });
	const conversation = await guestWrites("zalo", "zalo-user-4", "Linh");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect(await store.findMockCrmLeads(OFFICE)).toHaveLength(2);
	expect((await store.getConversation(conversation.id))?.crm).toBeNull();
});

// Spec #59 (#61): an office with no CRM gets no lead and no link.
test("an office with no CRM makes no lead", async () => {
	store = await testInboxStore();
	const conversation = await guestWrites("zalo", "zalo-user-5", "Hà");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect(await store.findMockCrmLeads(OFFICE)).toEqual([]);
	expect((await store.getConversation(conversation.id))?.crm).toBeNull();
});

// Spec #59 stories 16, 28 (#61): a WhatsApp guest's number finds their lead, however the office typed it.
test("a WhatsApp guest whose number is on a lead is linked to it by phone", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const lead = await existingLead({ phone: "+84901234567", name: "Minji Park" });
	const conversation = await guestWrites("whatsapp", "84901234567", "Minji");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect((await store.findMockCrmLeads(OFFICE)).map((found) => found.id)).toEqual([lead.id]);
	expect((await store.getConversation(conversation.id))?.crm).toEqual({
		leadId: lead.id,
		leadName: "Minji Park",
		method: "phone",
	});
});

// Spec #59 story 14 (#61): a new WhatsApp guest's lead carries their number in E.164.
test("a new WhatsApp guest's lead carries their number in E.164", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("whatsapp", "84912345678", "Yuki");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect(await store.findMockCrmLeads(OFFICE)).toMatchObject([
		{ name: "Yuki", phone: "+84912345678", zaloUserId: null, pipe: "whatsapp" },
	]);
});
