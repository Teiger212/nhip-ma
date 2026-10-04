import type { AlertOperator } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { guestAlertRecipients } from "./recipients";

/**
 * Who a guest's message alerts (ADR 0019 "Who", spec #84 "Recipients"): a pool thread alerts
 * every member of the office except the platform admin; an owned thread alerts its owner only.
 * Recipients equal visibility (ADR 0015): nobody is alerted about a thread they cannot open.
 */
const agent1: AlertOperator = { userId: "agent-1", platformRole: "user", locale: "en" };
const agent2: AlertOperator = { userId: "agent-2", platformRole: null, locale: null };
const manager: AlertOperator = { userId: "manager", platformRole: "user", locale: "vi" };
/** The office's creator, its kit `owner`: their membership opens nothing (ADR 0015). */
const platformAdmin: AlertOperator = { userId: "admin", platformRole: "admin", locale: "en" };
/** A platform admin whose role is a comma list (`packages/auth/lib/roles.ts`). */
const listedAdmin: AlertOperator = { userId: "admin-2", platformRole: "user,admin", locale: null };

const office = [agent1, agent2, manager, platformAdmin, listedAdmin];
const ids = (operators: AlertOperator[]) => operators.map((operator) => operator.userId).sort();

test("a pool guest alerts every agent and manager, never the platform admin", () => {
	expect(ids(guestAlertRecipients({ ownerId: null }, office))).toEqual([
		"agent-1",
		"agent-2",
		"manager",
	]);
});

test("an owned thread's guest alerts only its owner", () => {
	expect(ids(guestAlertRecipients({ ownerId: "agent-2" }, office))).toEqual(["agent-2"]);
});

test("a manager who owns a thread is its only recipient", () => {
	expect(ids(guestAlertRecipients({ ownerId: "manager" }, office))).toEqual(["manager"]);
});

test("an owner who is no longer in the office is not alerted: they cannot open the thread", () => {
	expect(guestAlertRecipients({ ownerId: "gone" }, office)).toEqual([]);
});

test("an office with only its platform admin alerts no one", () => {
	expect(guestAlertRecipients({ ownerId: null }, [platformAdmin])).toEqual([]);
});
