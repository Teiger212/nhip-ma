import { expect, test } from "vitest";

import { decideLead } from "./rules";

const minji = { id: "lead-minji", name: "Minji Park" };
const agency = { id: "lead-agency", name: "Minji's agency" };
const byPhone = { phone: "+84901234567", zaloUserId: null };
const byZaloId = { phone: null, zaloUserId: "zalo-user-1" };

// Spec #59, Q13: an existing lead is reused, never duplicated, and the link says how it was found.
test("a guest the CRM already knows reuses their lead, found by phone or by Zalo id", () => {
	expect(decideLead([minji], byPhone)).toEqual({ action: "reuse", lead: minji, method: "phone" });
	expect(decideLead([minji], byZaloId)).toEqual({ action: "reuse", lead: minji, method: "zaloId" });
});

// Spec #59, Q11: every new guest becomes a lead.
test("a guest the CRM does not know gets a new lead", () => {
	expect(decideLead([], byZaloId)).toEqual({ action: "create", method: "created" });
});

// Spec #59, story 29 and #61's decision: never guess, never add a third copy.
test("a guest matching two leads gets neither, and no new one", () => {
	expect(decideLead([minji, agency], byPhone)).toEqual({ action: "ambiguous" });
});
