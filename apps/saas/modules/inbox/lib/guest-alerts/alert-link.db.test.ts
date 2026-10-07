import type { AlertKind } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test } from "vitest";

import { testDb, testInboxStore } from "../test-store";
import type { Store } from "../types";
import { resolveAlertLink } from "./alert-link";
import { alertSounds } from "./burst";
import { alertLink } from "./content";

/**
 * An alert's link, `/<locale>/inbox?alert=<id>`, is resolved on the server for the viewer alone
 * (ADR 0019 "Nothing of the thread's identity leaves Nhịp", spec #84, #136): the viewer's own
 * alert on a thread they can open selects that thread; anything else (a colleague's alert, a
 * thread since given to someone else, an id that never existed or was pruned, a test alert)
 * opens nothing of a thread, so the link reveals nothing. The screen is Alerts 8 in
 * docs/e2e-scenarios.md.
 */
const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const agent = (userId: string, officeId = OFFICE) => ({ userId, officeId, role: "agent" as const });
const manager = { userId: "walk-user", officeId: OFFICE, role: "manager" as const };
const NOTICE = { threadId: null };

let store: Store;

async function member(officeId: string, userId: string, role: string) {
	await testDb.member.upsert({
		where: { organizationId_userId: { organizationId: officeId, userId } },
		create: {
			id: `m-${officeId}-${userId}`,
			organizationId: officeId,
			userId,
			role,
			createdAt: new Date(),
		},
		update: { role },
	});
}

async function guestWrites(guestId: string, officeId = OFFICE): Promise<string> {
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId,
			guestName: "Minji",
			text: "Xin chào",
			vendorMessageId: null,
		},
		officeId,
	);
	return conversation.id;
}

async function alert(
	userId: string,
	conversationId: string | null,
	{ kind = "guest", officeId = OFFICE }: { kind?: AlertKind; officeId?: string } = {},
): Promise<string> {
	const recorded = await store.recordAlert({
		officeId,
		conversationId,
		userId,
		kind,
		now: new Date(),
		link: (id) => alertLink("en", id),
		sounds: alertSounds,
	});
	return recorded.id;
}

beforeEach(async () => {
	store = await testInboxStore();
	await testDb.member.deleteMany({ where: { organizationId: { in: [OFFICE, OTHER_OFFICE] } } });
	await member(OFFICE, "agent-1", "member");
	await member(OFFICE, "agent-2", "member");
	await member(OFFICE, "walk-user", "admin");
});

// A member of two offices opens nothing (ADR 0010): leave no one in the second office.
afterEach(async () => {
	await testDb.member.deleteMany({ where: { organizationId: OTHER_OFFICE } });
});

test("the viewer's own alert on a thread they hold opens that thread", async () => {
	const thread = await guestWrites("own");
	await store.setOwner(thread, "agent-1", OFFICE);
	const id = await alert("agent-1", thread);
	expect(await resolveAlertLink(store, agent("agent-1"), id)).toEqual({ threadId: thread });
});

test("an agent's alert for a thread since reassigned to a colleague opens nothing of it", async () => {
	const thread = await guestWrites("reassigned");
	await store.setOwner(thread, "agent-1", OFFICE);
	const id = await alert("agent-1", thread);
	await store.setOwner(thread, "agent-2", OFFICE);
	expect(await resolveAlertLink(store, agent("agent-1"), id)).toEqual(NOTICE);
});

test("a colleague's alert opens nothing, even on a thread the viewer can open", async () => {
	const thread = await guestWrites("colleague");
	await store.setOwner(thread, "agent-1", OFFICE);
	const id = await alert("agent-1", thread);
	await store.setOwner(thread, "agent-2", OFFICE);
	expect(await resolveAlertLink(store, agent("agent-2"), id)).toEqual(NOTICE);
	expect(await resolveAlertLink(store, manager, id)).toEqual(NOTICE);
});

test("a manager's own alert opens the thread after it was given to an agent", async () => {
	const thread = await guestWrites("unassigned");
	const id = await alert("walk-user", thread);
	await store.setOwner(thread, "agent-2", OFFICE);
	expect(await resolveAlertLink(store, manager, id)).toEqual({ threadId: thread });
});

test("an id that never existed, or was pruned, opens nothing", async () => {
	const thread = await guestWrites("pruned");
	await store.setOwner(thread, "agent-1", OFFICE);
	const id = await alert("agent-1", thread);
	expect(await resolveAlertLink(store, agent("agent-1"), "c-never-existed")).toEqual(NOTICE);
	expect(await resolveAlertLink(store, agent("agent-1"), "")).toEqual(NOTICE);
	await store.pruneAlerts(new Date(Date.now() + 60_000));
	expect(await resolveAlertLink(store, agent("agent-1"), id)).toEqual(NOTICE);
});

test("a test alert has no thread and opens nothing", async () => {
	const id = await alert("agent-1", null, { kind: "test" });
	expect(await resolveAlertLink(store, agent("agent-1"), id)).toEqual(NOTICE);
});

test("the viewer's own alert from another office opens nothing in this one", async () => {
	await member(OTHER_OFFICE, "agent-1", "member");
	const thread = await guestWrites("elsewhere", OTHER_OFFICE);
	await store.setOwner(thread, "agent-1", OTHER_OFFICE);
	const id = await alert("agent-1", thread, { officeId: OTHER_OFFICE });
	expect(await resolveAlertLink(store, agent("agent-1"), id)).toEqual(NOTICE);
});
