import { expect, test } from "vitest";

import { decideLead } from "./rules";

const minji = { id: "lead-minji", name: "Minji Park" };
const agency = { id: "lead-agency", name: "Minji's agency" };

// Spec #59, Q13: an existing lead is reused, never duplicated.
test("a guest the CRM already knows reuses their lead", () => {
	expect(decideLead([minji])).toEqual({ action: "reuse", lead: minji });
});

// Spec #59, Q11: every new guest becomes a lead.
test("a guest the CRM does not know gets a new lead", () => {
	expect(decideLead([])).toEqual({ action: "create" });
});

// Spec #59, story 29 and #61's decision: never guess, never add a third copy.
test("a guest matching two leads gets neither, and no new one", () => {
	expect(decideLead([minji, agency])).toEqual({ action: "ambiguous" });
});
