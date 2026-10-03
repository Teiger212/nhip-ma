import type { InboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { applyOneShot } from "../inbox";
import { testInboxStore } from "../test-store";
import { mockCrmAdapter } from "./mock";
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
	const written = await guestWrites("zalo", "zalo-user-1", "Thảo Nguyễn");
	// What Nhịp extracts from the message (the one-shot) before the lead is written.
	const conversation = (await applyOneShot(store, written)) ?? written;

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	const leads = await store.findMockCrmLeads(OFFICE);
	expect(leads).toHaveLength(1);
	expect(leads[0]).toMatchObject({
		name: "Thảo Nguyễn",
		zaloUserId: "zalo-user-1",
		phone: null,
		pipe: "zalo",
		language: "vi",
		threadUrl: threadUrl(conversation.id),
	});
	expect(leads[0].fields).toMatchObject({ rentOrBuy: "rent" });
	expect(JSON.stringify(leads[0])).not.toContain("Xin chào");
	expect((await store.getConversation(conversation.id))?.crm).toMatchObject({
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
	expect((await store.getConversation(conversation.id))?.crm).toMatchObject({
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

// Spec #59 story 16 (#61): a WhatsApp guest's number, in E.164, finds their lead.
test("a WhatsApp guest whose number is on a lead is linked to it by phone", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const lead = await existingLead({ phone: "+84901234567", name: "Minji Park" });
	const conversation = await guestWrites("whatsapp", "84901234567", "Minji");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect((await store.findMockCrmLeads(OFFICE)).map((found) => found.id)).toEqual([lead.id]);
	expect((await store.getConversation(conversation.id))?.crm).toMatchObject({
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

// Spec #59 story 22 (#61): a failed write never blocks the thread; the guest's next message tries again.
test("a lead write the CRM refuses leaves the thread free to try again", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo", "zalo-user-6", "Quân");
	const refusing = (_connection: unknown, deps: { store: InboxStore; officeId: string }) => ({
		...mockCrmAdapter(deps.store, deps.officeId),
		createLead: () => Promise.reject(new Error("CRM is down")),
	});

	await expect(
		createCrmSync({ store, threadUrl, adapterFor: refusing }).newGuest(conversation),
	).rejects.toThrow();
	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect((await store.findMockCrmLeads(OFFICE)).map((lead) => lead.name)).toEqual(["Quân"]);
});

// Spec #59 story 29 (#61): a number on two leads matches neither.
test("a WhatsApp guest whose number is on two leads is linked to neither, and no lead is added", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	await existingLead({ phone: "+84901234567", name: "Minji Park" });
	await existingLead({ phone: "+84901234567", name: "Minji's agency" });
	const conversation = await guestWrites("whatsapp", "84901234567", "Minji");

	await createCrmSync({ store, threadUrl }).newGuest(conversation);

	expect(await store.findMockCrmLeads(OFFICE)).toHaveLength(2);
	expect((await store.getConversation(conversation.id))?.crm).toBeNull();
});

async function leadOf(conversationId: string) {
	const conversation = await store.getConversation(conversationId);
	if (!conversation?.crm) throw new Error("the thread has no lead");
	return conversation.crm;
}

// ADR 0003 (Q3): the CRM reports a lead lost; Nhịp caches it, observed when it first heard it.
test("an outcome the CRM reports is cached on the lead's thread, observed when Nhịp heard it", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo", "zalo-user-7", "Alexei");
	const sync = createCrmSync({ store, threadUrl });
	await sync.newGuest(conversation);
	const { leadId } = await leadOf(conversation.id);
	const closedAt = new Date("2026-10-02T09:00:00.000Z");
	await store.setMockCrmLeadOutcome(OFFICE, leadId, {
		status: "lost",
		at: closedAt,
		reason: "price",
	});

	await sync.outcomesChanged(OFFICE, [leadId], new Date("2026-10-03T12:00:00.000Z"));
	await sync.outcomesChanged(OFFICE, [leadId], new Date("2026-10-03T13:00:00.000Z"));

	expect(await leadOf(conversation.id)).toMatchObject({
		outcome: "lost",
		outcomeAt: "2026-10-02T09:00:00.000Z",
		outcomeReason: "price",
		outcomeObservedAt: "2026-10-03T12:00:00.000Z",
	});
});

// ADR 0008: an office's CRM speaks only for that office's threads.
test("outcomes reported for one office never touch another office's threads", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	await store.setCrmConnection("office-b", "mock");
	const conversation = await guestWrites("zalo", "zalo-user-8", "Yuki");
	const sync = createCrmSync({ store, threadUrl });
	await sync.newGuest(conversation);
	const { leadId } = await leadOf(conversation.id);
	await store.setMockCrmLeadOutcome(OFFICE, leadId, { status: "won", at: null, reason: null });

	await sync.outcomesChanged("office-b", [leadId], new Date("2026-10-03T12:00:00.000Z"));

	expect((await leadOf(conversation.id)).outcome).toBeNull();
});

// ADR 0003: a CRM speaks only for offices connected to it; a notice from another kind changes nothing.
test("a notice from a CRM the office is not on changes nothing", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo", "zalo-user-11", "Hải");
	const sync = createCrmSync({ store, threadUrl });
	await sync.newGuest(conversation);
	const { leadId } = await leadOf(conversation.id);
	await store.setMockCrmLeadOutcome(OFFICE, leadId, { status: "lost", at: null, reason: null });

	await sync.outcomesChanged(OFFICE, [leadId], new Date(), { from: "another-crm" as "mock" });

	expect((await leadOf(conversation.id)).outcome).toBeNull();
});

// Spec #59 story 35 (#62): another CRM's leads mean nothing; the same CRM keeps its links.
test("choosing the office's CRM again keeps its links; choosing none drops them, and only its own", async () => {
	store = await testInboxStore();
	const sync = createCrmSync({ store, threadUrl });
	expect(await sync.connectOffice(OFFICE, "mock")).toBe("connected");
	expect(await sync.connectOffice("office-b", "mock")).toBe("connected");
	const ours = await guestWrites("zalo", "zalo-user-9", "Minh");
	const theirs = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId: "zalo-user-10",
			guestName: "Lan",
			text: "Chào",
			vendorMessageId: null,
		},
		"office-b",
	);
	await sync.newGuest(ours);
	await sync.newGuest(theirs);

	await sync.connectOffice(OFFICE, "mock");
	expect((await store.getConversation(ours.id))?.crm?.leadName).toBe("Minh");

	await sync.connectOffice(OFFICE, null);
	expect((await store.getConversation(ours.id))?.crm).toBeNull();
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	expect((await store.getConversation(theirs.id))?.crm?.leadName).toBe("Lan");
});

// #62: an office that does not exist cannot be connected.
test("an unknown office cannot be connected to a CRM", async () => {
	store = await testInboxStore();
	expect(await createCrmSync({ store, threadUrl }).connectOffice("no-such-office", "mock")).toBe(
		"no_office",
	);
});

/* ------------------------------------------------- an office on a CRM that takes an access token */

/** The deployment's key for sealed tokens (ADR 0017), as `PIPE_SECRETS_KEY` holds it. */
const SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

/**
 * The sync with an adapter factory that remembers the connection it was handed and answers as
 * the mock CRM, so a guest's first message shows which token the office's CRM would be opened with.
 */
function syncSeeingTokens() {
	const seen: Array<string | null> = [];
	const sync = createCrmSync({
		store,
		threadUrl,
		secretsKey: SECRETS_KEY,
		adapterFor: (connection, deps) => {
			seen.push(connection.token);
			return mockCrmAdapter(deps.store, deps.officeId);
		},
	});
	return { sync, seen };
}

/** A thread of the office linked to a lead, as a guest's first message leaves it. */
async function linkedThread(sync: ReturnType<typeof createCrmSync>, guestId: string, name: string) {
	const conversation = await guestWrites("zalo", guestId, name);
	await sync.newGuest(conversation);
	expect((await leadOf(conversation.id)).leadName).toBe(name);
	return conversation;
}

// ADR 0003 (2026-10-03), ADR 0017, spec #59 story 33 (#65): the token is stored encrypted, and
// only the CRM's adapter gets it back in the clear.
test("an office connected to HubSpot keeps its token sealed, and its CRM is opened with that token", async () => {
	store = await testInboxStore();
	const { sync, seen } = syncSeeingTokens();

	expect(await sync.connectOffice(OFFICE, "hubspot", "pat-eu1-first-token")).toBe("connected");

	expect(await store.getCrmConnection(OFFICE)).toEqual({ kind: "hubspot", tokenSet: true });
	const sealed = await store.getCrmAccessToken(OFFICE);
	expect(sealed).toBeTruthy();
	expect(sealed).not.toContain("pat-eu1-first-token");
	await linkedThread(sync, "zalo-user-20", "Mai");
	expect(seen).toEqual(["pat-eu1-first-token"]);
});

// #65: HubSpot with no token is not saved; the office stays as it was.
test("HubSpot without a token is refused, and the office keeps its CRM and links", async () => {
	store = await testInboxStore();
	const { sync } = syncSeeingTokens();
	await sync.connectOffice(OFFICE, "mock");
	const linked = await linkedThread(sync, "zalo-user-21", "Phúc");

	expect(await sync.connectOffice(OFFICE, "hubspot")).toBe("token_required");
	expect(await sync.connectOffice(OFFICE, "hubspot", "   ")).toBe("token_required");

	expect(await store.getCrmConnection(OFFICE)).toEqual({ kind: "mock", tokenSet: false });
	expect((await leadOf(linked.id)).leadName).toBe("Phúc");
});

// #65: saving a new token replaces it; the same CRM keeps the office's links (spec #59 story 35).
test("a new HubSpot token replaces the old one and keeps the office's links", async () => {
	store = await testInboxStore();
	const { sync, seen } = syncSeeingTokens();
	await sync.connectOffice(OFFICE, "hubspot", "pat-eu1-old-token");
	const linked = await linkedThread(sync, "zalo-user-22", "Hương");

	expect(await sync.connectOffice(OFFICE, "hubspot", "pat-eu1-new-token")).toBe("connected");

	expect((await leadOf(linked.id)).leadName).toBe("Hương");
	await linkedThread(sync, "zalo-user-23", "Tuấn");
	expect(seen).toEqual(["pat-eu1-old-token", "pat-eu1-new-token"]);
	expect(await store.getCrmAccessToken(OFFICE)).not.toContain("pat-eu1-new-token");
});

// #65, spec #59 story 35: another CRM, or none, drops HubSpot's token with the office's links.
test("switching away from HubSpot drops its token and the office's links", async () => {
	store = await testInboxStore();
	const { sync } = syncSeeingTokens();
	await sync.connectOffice(OFFICE, "hubspot", "pat-eu1-gone-token");
	const linked = await linkedThread(sync, "zalo-user-24", "Lan");

	expect(await sync.connectOffice(OFFICE, "mock")).toBe("connected");
	expect(await store.getCrmConnection(OFFICE)).toEqual({ kind: "mock", tokenSet: false });
	expect(await store.getCrmAccessToken(OFFICE)).toBeNull();
	expect((await store.getConversation(linked.id))?.crm).toBeNull();

	await sync.connectOffice(OFFICE, "hubspot", "pat-eu1-again-token");
	expect(await sync.connectOffice(OFFICE, null)).toBe("connected");
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	expect(await store.getCrmAccessToken(OFFICE)).toBeNull();
});

// ADR 0017: a token is never stored in the clear; without the deployment's key nothing is saved.
test("without the deployment's secrets key, HubSpot is not saved", async () => {
	store = await testInboxStore();
	const sync = createCrmSync({ store, threadUrl });

	expect(await sync.connectOffice(OFFICE, "hubspot", "pat-eu1-no-key")).toBe("no_secrets_key");

	expect(await store.getCrmConnection(OFFICE)).toBeNull();
});
