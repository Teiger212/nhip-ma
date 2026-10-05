import { expect, test } from "vitest";

import { decideLead, observeOutcome } from "./rules";

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

const seenLost = {
	outcome: "lost" as const,
	outcomeAt: "2026-10-01T09:00:00.000Z",
	outcomeReason: "price",
	outcomeObservedAt: "2026-10-01T10:00:00.000Z",
};
const NOW = new Date("2026-10-03T12:00:00.000Z");

// ADR 0003 (Q3): a won or lost outcome is observed when Nhịp first sees it.
test("a newly decided outcome is observed now, and keeps the CRM's own date for display", () => {
	expect(
		observeOutcome(null, { status: "lost", at: "2026-10-01T09:00:00.000Z", reason: "price" }, NOW),
	).toEqual({
		outcome: "lost",
		outcomeAt: "2026-10-01T09:00:00.000Z",
		outcomeReason: "price",
		outcomeObservedAt: "2026-10-03T12:00:00.000Z",
	});
});

// ADR 0003 (Q3): seen again, the same outcome keeps its first observation.
test("the same outcome seen again keeps its first observation", () => {
	expect(
		observeOutcome(
			seenLost,
			{ status: "lost", at: "2026-10-01T09:00:00.000Z", reason: "price" },
			NOW,
		).outcomeObservedAt,
	).toBe("2026-10-01T10:00:00.000Z");
});

// ADR 0003 (Q3): a different decision is a new observation; an open lead has none.
test("a different decision is observed anew, and an open lead has no observation", () => {
	expect(
		observeOutcome(seenLost, { status: "won", at: "2026-10-03T08:00:00.000Z", reason: null }, NOW)
			.outcomeObservedAt,
	).toBe("2026-10-03T12:00:00.000Z");
	expect(observeOutcome(seenLost, { status: "open", at: null, reason: null }, NOW)).toEqual({
		outcome: "open",
		outcomeAt: null,
		outcomeReason: null,
		outcomeObservedAt: null,
	});
});
