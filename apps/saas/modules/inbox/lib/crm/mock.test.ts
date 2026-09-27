import { createInboxStore } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { resetTestInbox, testDb } from "../test-store";
import { crmAdapterFor } from "./index";

test("the mock CRM matches by phone, searches by name for the picker, and reports outcomes", async () => {
	await resetTestInbox();
	const store = createInboxStore(testDb);
	await store.upsertMockCrmLead({
		id: "m1",
		officeId: "office-a",
		name: "Minji Park",
		phone: "+84901234567",
		outcome: "won",
		outcomeAt: "2026-09-20T00:00:00.000Z",
		outcomeReason: null,
	});
	await store.upsertMockCrmLead({
		id: "m2",
		officeId: "office-a",
		name: "Yuki Tanaka",
		phone: null,
		outcome: "open",
		outcomeAt: null,
		outcomeReason: null,
	});
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
	expect((await crm.searchLeads("yuki")).map((lead) => lead.id)).toEqual(["m2"]);
	expect(await crm.getLead("nope")).toBeNull();
	expect(await crm.outcomesFor(["m1", "m2", "nope"])).toEqual({
		m1: { status: "won", at: "2026-09-20T00:00:00.000Z", reason: null },
		m2: { status: "open", at: null, reason: null },
	});
	await store.close();
});
