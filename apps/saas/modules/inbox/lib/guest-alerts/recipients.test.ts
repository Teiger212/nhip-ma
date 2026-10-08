import type { AlertOperator } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { guestAlertRecipients, ownerChangeEffects } from "./recipients";

/**
 * Who a guest's message alerts (ADR 0019 "Who", amended by ADR 0022; spec #160 "Alerts"): an
 * Unassigned thread alerts the office's managers only; an owned thread alerts its owner only.
 * Recipients equal visibility: nobody is alerted about a thread they cannot open.
 */
const agent1: AlertOperator = {
	userId: "agent-1",
	platformRole: "user",
	manager: false,
};
const agent2: AlertOperator = {
	userId: "agent-2",
	platformRole: null,
	manager: false,
};
const manager: AlertOperator = {
	userId: "manager",
	platformRole: "user",
	manager: true,
};
const manager2: AlertOperator = {
	userId: "manager-2",
	platformRole: null,
	manager: true,
};
/** The office's creator, its kit `owner` (a manager by member role): their membership opens nothing. */
const platformAdmin: AlertOperator = {
	userId: "admin",
	platformRole: "admin",
	manager: true,
};
/** A platform admin whose role is a comma list (`packages/auth/lib/roles.ts`). */
const listedAdmin: AlertOperator = {
	userId: "admin-2",
	platformRole: "user,admin",
	manager: true,
};

const office = [agent1, agent2, manager, manager2, platformAdmin, listedAdmin];
const ids = (operators: AlertOperator[]) => operators.map((operator) => operator.userId).sort();

test("an Unassigned guest alerts the managers only: no agent, never the platform admin", () => {
	expect(ids(guestAlertRecipients({ ownerId: null }, office))).toEqual(["manager", "manager-2"]);
});

test("an owned thread's guest alerts only its owner, not the managers", () => {
	expect(ids(guestAlertRecipients({ ownerId: "agent-2" }, office))).toEqual(["agent-2"]);
});

test("a manager who owns a thread is its only recipient", () => {
	expect(ids(guestAlertRecipients({ ownerId: "manager" }, office))).toEqual(["manager"]);
});

test("an owner who is no longer in the office is not alerted: they cannot open the thread", () => {
	expect(guestAlertRecipients({ ownerId: "gone" }, office)).toEqual([]);
});

test("an office whose only manager is its platform admin alerts no one for an Unassigned guest", () => {
	expect(guestAlertRecipients({ ownerId: null }, [agent1, agent2, platformAdmin])).toEqual([]);
});

/**
 * What a manager's owner change sets off (ADR 0022 "Alerts", #133; docs/e2e-scenarios.md
 * Alerts 3 and 4): an assignment alerts the chosen operator unless they chose themselves, a
 * return to Unassigned alerts the other managers, and the operator the thread left gets a bell
 * row (P4). Whoever acts is never alerted for it, and recipients equal visibility (S2).
 */
function effects(previousOwnerId: string | null, newOwnerId: string | null, actorId = "manager") {
	const { alert, movedFrom } = ownerChangeEffects({ previousOwnerId, newOwnerId, actorId }, office);
	return {
		alert: alert && { kind: alert.kind, to: ids(alert.recipients) },
		movedFrom: movedFrom?.userId ?? null,
	};
}

test("an Unassigned lead given to an agent alerts that agent only, and moves it from no one", () => {
	expect(effects(null, "agent-1")).toEqual({
		alert: { kind: "assigned", to: ["agent-1"] },
		movedFrom: null,
	});
});

test("a reassignment alerts the new owner; the one who lost it gets the bell row, not an alert", () => {
	expect(effects("agent-1", "agent-2")).toEqual({
		alert: { kind: "assigned", to: ["agent-2"] },
		movedFrom: "agent-1",
	});
});

test("a thread given to another manager alerts that manager", () => {
	expect(effects(null, "manager-2")).toEqual({
		alert: { kind: "assigned", to: ["manager-2"] },
		movedFrom: null,
	});
});

test("a manager who takes an Unassigned lead themselves sets off nothing", () => {
	expect(effects(null, "manager")).toEqual({ alert: null, movedFrom: null });
});

test("a manager who takes an agent's thread is not alerted, and the agent gets the bell row", () => {
	expect(effects("agent-1", "manager")).toEqual({ alert: null, movedFrom: "agent-1" });
});

test("a return to Unassigned alerts the other managers: not the one who returned it, no agent, never the platform admin", () => {
	expect(effects("agent-1", null)).toEqual({
		alert: { kind: "returned", to: ["manager-2"] },
		movedFrom: "agent-1",
	});
});

test("a manager who returns their own thread alerts the other managers and gets no bell row", () => {
	expect(effects("manager", null)).toEqual({
		alert: { kind: "returned", to: ["manager-2"] },
		movedFrom: null,
	});
});

test("another manager's thread returned: they are alerted as a manager and get the bell row as its owner", () => {
	expect(effects("manager-2", null)).toEqual({
		alert: { kind: "returned", to: ["manager-2"] },
		movedFrom: "manager-2",
	});
});

test("an office whose only other manager is its platform admin alerts no one for a return", () => {
	const { alert } = ownerChangeEffects(
		{ previousOwnerId: "agent-1", newOwnerId: null, actorId: "manager" },
		[agent1, agent2, manager, platformAdmin],
	);
	expect(alert).toBeNull();
});

test("no change sets off nothing: the same owner again, or Unassigned returned to Unassigned", () => {
	expect(effects("agent-1", "agent-1")).toEqual({ alert: null, movedFrom: null });
	expect(effects(null, null)).toEqual({ alert: null, movedFrom: null });
});

test("an owner who cannot open the thread (not an operator of the office) is not alerted", () => {
	expect(effects(null, "gone")).toEqual({ alert: null, movedFrom: null });
});
