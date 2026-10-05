import type { AlertOperator } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { guestAlertRecipients } from "./recipients";

/**
 * Who a guest's message alerts (ADR 0019 "Who", amended by ADR 0022; spec #160 "Alerts"): an
 * Unassigned thread alerts the office's managers only; an owned thread alerts its owner only.
 * Recipients equal visibility: nobody is alerted about a thread they cannot open.
 */
const agent1: AlertOperator = {
	userId: "agent-1",
	platformRole: "user",
	locale: "en",
	manager: false,
};
const agent2: AlertOperator = {
	userId: "agent-2",
	platformRole: null,
	locale: null,
	manager: false,
};
const manager: AlertOperator = {
	userId: "manager",
	platformRole: "user",
	locale: "vi",
	manager: true,
};
const manager2: AlertOperator = {
	userId: "manager-2",
	platformRole: null,
	locale: null,
	manager: true,
};
/** The office's creator, its kit `owner` (a manager by member role): their membership opens nothing. */
const platformAdmin: AlertOperator = {
	userId: "admin",
	platformRole: "admin",
	locale: "en",
	manager: true,
};
/** A platform admin whose role is a comma list (`packages/auth/lib/roles.ts`). */
const listedAdmin: AlertOperator = {
	userId: "admin-2",
	platformRole: "user,admin",
	locale: null,
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
