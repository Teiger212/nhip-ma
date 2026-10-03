import { expect, test } from "vitest";

import { testInboxStore } from "../test-store";
import { crmAdapterFor } from "./index";

const lead = (
	id: string,
	name: string,
	phone: string | null,
	outcome: "open" | "won" = "open",
) => ({
	id,
	officeId: "office-a",
	name,
	phone,
	outcome,
	outcomeAt: outcome === "won" ? "2026-09-20T00:00:00.000Z" : null,
	outcomeReason: null,
});

// ADR 0003: the mock CRM matches by phone only, the picker searches by name, outcomes come from the CRM.
test("the mock CRM matches by phone, searches by name for the picker, and reports outcomes", async () => {
	const store = await testInboxStore();
	await store.upsertMockCrmLead(lead("m1", "Minji Park", "+84901234567", "won"));
	await store.upsertMockCrmLead(lead("m2", "Yuki Tanaka", null));
	const crm = crmAdapterFor({ kind: "mock" }, { store, officeId: "office-a" });

	expect(await crm.findLeadForConversation({ pipe: "whatsapp", guestId: "84901234567" })).toEqual({
		id: "m1",
		name: "Minji Park",
		phone: "+84901234567",
	});
	expect(await crm.findLeadForConversation({ pipe: "zalo", guestId: "84901234567" })).toBeNull();
	expect(
		await crm.findLeadForConversation({ pipe: "whatsapp", guestId: "84999999999" }),
	).toBeNull();
	expect((await crm.searchLeads("yuki")).map((found) => found.id)).toEqual(["m2"]);
	expect(await crm.getLead("nope")).toBeNull();
	expect(await crm.outcomesFor(["m1", "m2", "nope"])).toEqual({
		m1: { status: "won", at: "2026-09-20T00:00:00.000Z", reason: null },
		m2: { status: "open", at: null, reason: null },
	});
	await store.close();
});

// ADR 0003: never guess. Two leads on one phone are left for a manager to link by hand.
test("a phone shared by two leads matches neither", async () => {
	const store = await testInboxStore();
	await store.upsertMockCrmLead(lead("m1", "Minji Park", "+84901234567"));
	await store.upsertMockCrmLead(lead("m3", "Minji's agency", "+84901234567"));
	const crm = crmAdapterFor({ kind: "mock" }, { store, officeId: "office-a" });
	expect(
		await crm.findLeadForConversation({ pipe: "whatsapp", guestId: "84901234567" }),
	).toBeNull();
	await store.close();
});
