import fs from "node:fs";
import path from "node:path";

import { beforeEach, expect, test } from "vitest";

import { yourTurnCount } from "./queue";
import { account, guestMessage, membership } from "./test-fixtures";
import { testDb, testInboxStore } from "./test-store";
import type { Store } from "./types";

/**
 * Managers assign every new lead (ADR 0022) in the store: an Unassigned thread is the
 * managers' alone, an agent reads only their own threads, the last assignment wins, a manager's
 * reply claims an Unassigned lead (P1), and an ended owner's threads go back to Unassigned. The
 * screens are covered end to end (docs/e2e-scenarios.md "Assigning leads").
 */
const OFFICE = "office-a";
const agent = (userId: string) => ({ userId, officeId: OFFICE, role: "agent" as const });
const manager = { userId: "walk-user", officeId: OFFICE, role: "manager" as const };
const manager2 = { userId: "manager-2", officeId: OFFICE, role: "manager" as const };

let store: Store;

const member = (userId: string, role: string) => membership(OFFICE, userId, role);

async function guestWrites(guestId: string) {
	const { conversation } = await store.upsertInbound(
		guestMessage(guestId, {
			pipe: "whatsapp",
			guestName: guestId,
			text: "Hello",
			pipeExternalId: "phone-a",
		}),
		OFFICE,
	);
	return conversation;
}

/** What `viewer` reaches of thread `id`: listed, summarised (the list, search), counted, opened. */
async function reach(viewer: Parameters<Store["listConversations"]>[0], id: string) {
	const summaries = await store.listConversationSummaries(viewer);
	return {
		listed: (await store.listConversations(viewer)).some((c) => c.id === id),
		summarised: summaries.some((c) => c.id === id),
		counted: yourTurnCount(summaries.filter((c) => c.id === id)),
		opened: (await store.getConversation(id, viewer)) !== null,
	};
}
const NONE = { listed: false, summarised: false, counted: 0, opened: false };
const ALL = { listed: true, summarised: true, counted: 1, opened: true };

beforeEach(async () => {
	store = await testInboxStore();
	await account("manager-2");
	await member("agent-1", "member");
	await member("agent-2", "member");
	await member("walk-user", "admin");
	await member("manager-2", "owner");
});

test("a new thread is Unassigned and the managers' only: no agent lists, counts or opens it", async () => {
	const conv = await guestWrites("g-new");
	expect(conv.owner).toBeNull();
	for (const viewer of [manager, manager2]) {
		expect(await reach(viewer, conv.id)).toEqual(ALL);
	}
	for (const viewer of [agent("agent-1"), agent("agent-2")]) {
		expect(await reach(viewer, conv.id)).toEqual(NONE);
	}
});

test("an assigned thread is its owner's and the managers': the other agent still reaches nothing", async () => {
	const conv = await guestWrites("g-assigned");
	expect(await store.setOwner(conv.id, "agent-1", OFFICE)).toBe(true);
	expect(await reach(agent("agent-1"), conv.id)).toEqual(ALL);
	expect(await reach(manager, conv.id)).toEqual(ALL);
	expect(await reach(agent("agent-2"), conv.id)).toEqual(NONE);
});

test("two managers assigning: the last setOwner wins, and the first-chosen agent loses the thread", async () => {
	const conv = await guestWrites("g-last-wins");
	expect(await store.setOwner(conv.id, "agent-1", OFFICE)).toBe(true);
	expect(await store.setOwner(conv.id, "agent-2", OFFICE)).toBe(true);
	for (const viewer of [manager, manager2]) {
		expect((await store.getConversation(conv.id, viewer))?.owner?.id).toBe("agent-2");
	}
	expect(await reach(agent("agent-2"), conv.id)).toEqual(ALL);
	expect(await reach(agent("agent-1"), conv.id)).toEqual(NONE);
});

test("two managers reassigning at once each learn the owner their own change replaced (#133)", async () => {
	const conv = await guestWrites("g-at-once");
	await store.setOwner(conv.id, "agent-1", OFFICE);
	const [toTwo, toManager] = await Promise.all([
		store.reassign(conv.id, "agent-2", OFFICE),
		store.reassign(conv.id, "walk-user", OFFICE),
	]);
	// One ran first and took the thread from agent 1; the other took it from whoever that gave it
	// to. Read before the lock, both would say agent 1, and agent 1 would hear of it twice.
	const replaced = [toTwo?.previousOwnerId, toManager?.previousOwnerId];
	const last = (await store.getConversation(conv.id, manager))?.owner?.id;
	expect(replaced).toEqual(
		expect.arrayContaining(last === "agent-2" ? ["agent-1", "walk-user"] : ["agent-1", "agent-2"]),
	);
	expect(await store.reassign(conv.id, "not-a-member", OFFICE)).toBeNull();
	expect(await store.reassign("no-such-thread", null, OFFICE)).toBeNull();
});

test("returned to Unassigned, a thread leaves its agent", async () => {
	const conv = await guestWrites("g-returned");
	await store.setOwner(conv.id, "agent-1", OFFICE);
	expect(await store.setOwner(conv.id, null, OFFICE)).toBe(true);
	expect((await store.getConversation(conv.id, manager))?.owner).toBeNull();
	expect(await reach(agent("agent-1"), conv.id)).toEqual(NONE);
});

test("a manager who approves a reply on an Unassigned lead owns it (P1)", async () => {
	const conv = await guestWrites("g-manager-claims");
	const begun = await store.beginAnswer({
		officeId: conv.officeId,
		conversationId: conv.id,
		inboundId: conv.unansweredInboundId!,
		text: "Hi",
		operatorId: "walk-user",
	});
	expect(begun.ok).toBe(true);
	expect((await store.getConversation(conv.id, manager2))?.owner?.id).toBe("walk-user");
	expect(await reach(agent("agent-1"), conv.id)).toEqual(NONE);
});

// ADR 0020: approve's lock on the conversation is `FOR KEY SHARE`, which the owner claim's
// update does not wait on, so two approvals still let one in and refuse the other.
test("two managers approving the same Unassigned lead at once end with one owner and one in_progress", async () => {
	const conv = await guestWrites("g-race");
	const approve = (operatorId: string) =>
		store.beginAnswer({
			officeId: conv.officeId,
			conversationId: conv.id,
			inboundId: conv.unansweredInboundId!,
			text: `from ${operatorId}`,
			operatorId,
		});
	const [a, b] = await Promise.all([approve("walk-user"), approve("manager-2")]);
	expect([a, b].map((result) => (result.ok ? "ok" : result.reason)).sort()).toEqual([
		"in_progress",
		"ok",
	]);
	const winner = [a, b].filter((result) => result.ok);
	expect(winner).toHaveLength(1);
	const owner = (await store.getConversation(conv.id, manager))?.owner?.id;
	expect(owner).toBe(winner[0]!.ok ? winner[0]!.answer.operatorId : null);
});

test("an owner whose account ends leaves their threads to Unassigned, which no agent sees", async () => {
	const conv = await guestWrites("g-leaver");
	await account("leaver");
	await member("leaver", "member");
	expect(await store.setOwner(conv.id, "leaver", OFFICE)).toBe(true);
	await testDb.user.delete({ where: { id: "leaver" } });
	expect((await store.getConversation(conv.id, manager))?.owner).toBeNull();
	expect(await reach(agent("agent-1"), conv.id)).toEqual(NONE);
});

test("assigning only to a member of the thread's office", async () => {
	const conv = await guestWrites("g-member");
	expect(await store.setOwner(conv.id, "agent-2", OFFICE)).toBe(true);
	expect(await store.setOwner(conv.id, "not-a-member", OFFICE)).toBe(false);
	expect((await store.getConversation(conv.id, manager))?.owner?.id).toBe("agent-2");
});

test("the rollout backfill: the first sent Answer's approver owns it, if still an operator", async () => {
	const answered = await guestWrites("g-backfill");
	const leftBehind = await guestWrites("g-backfill-gone");
	const neverAnswered = await guestWrites("g-backfill-none");
	for (const [conv, operatorId] of [
		[answered, "agent-2"],
		[leftBehind, "agent-1"],
	] as const) {
		const begun = await store.beginAnswer({
			officeId: conv.officeId,
			conversationId: conv.id,
			inboundId: conv.unansweredInboundId!,
			text: "Hi",
			operatorId,
		});
		if (!begun.ok) throw new Error("beginAnswer");
		await store.completeAnswer(conv.officeId, begun.answer.id, {
			mock: true,
			pipe: "whatsapp",
			vendorMessageId: `v-${conv.guestId}`,
		});
	}
	// As before this feature: nobody owns anything, and agent 1 has since left the office.
	await testDb.conversation.updateMany({ where: { officeId: OFFICE }, data: { ownerId: null } });
	await testDb.member.deleteMany({ where: { organizationId: OFFICE, userId: "agent-1" } });

	const migration = fs.readFileSync(
		path.resolve(
			__dirname,
			"../../../../../packages/database/prisma/migrations",
			fs
				.readdirSync(path.resolve(__dirname, "../../../../../packages/database/prisma/migrations"))
				.find((name) => name.endsWith("_conversation_owner"))!,
			"migration.sql",
		),
		"utf8",
	);
	const backfill = migration.slice(
		migration.indexOf("-- BACKFILL START"),
		migration.indexOf("-- BACKFILL END"),
	);
	await testDb.$executeRawUnsafe(backfill);
	await testDb.$executeRawUnsafe(backfill); // idempotent

	const owner = async (id: string) => (await store.getConversation(id, manager))?.owner?.id ?? null;
	expect(await owner(answered.id)).toBe("agent-2");
	expect(await owner(leftBehind.id)).toBeNull();
	expect(await owner(neverAnswered.id)).toBeNull();
});
