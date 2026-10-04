import fs from "node:fs";
import path from "node:path";

import { beforeEach, expect, test } from "vitest";

import { testDb, testInboxStore } from "./test-store";
import type { Store } from "./types";

/**
 * Pool then owner (ADR 0015) in the store: who sees what, who claims, what a leaver leaves,
 * and the one-off backfill. The screens are covered end to end (docs/e2e-scenarios.md).
 */
const OFFICE = "office-a";
const agent = (userId: string) => ({ userId, officeId: OFFICE, role: "agent" as const });
const manager = { userId: "walk-user", officeId: OFFICE, role: "manager" as const };

let store: Store;

async function member(userId: string, role: string) {
	await testDb.member.upsert({
		where: { organizationId_userId: { organizationId: OFFICE, userId } },
		create: { id: `m-${userId}`, organizationId: OFFICE, userId, role, createdAt: new Date() },
		update: { role },
	});
}

async function guestWrites(guestId: string) {
	const { conversation } = await store.upsertInbound(
		{
			pipe: "whatsapp",
			source: "guest",
			guestId,
			guestName: guestId,
			text: "Hello",
			vendorMessageId: null,
			pipeExternalId: "phone-a",
		},
		OFFICE,
	);
	return conversation;
}

beforeEach(async () => {
	store = await testInboxStore();
	await testDb.member.deleteMany({ where: { organizationId: OFFICE } });
	await member("agent-1", "member");
	await member("agent-2", "member");
	await member("walk-user", "admin");
});

test("a new thread is in the pool: every agent and the manager see it", async () => {
	const conv = await guestWrites("g-pool");
	expect(conv.owner).toBeNull();
	for (const viewer of [agent("agent-1"), agent("agent-2"), manager]) {
		expect((await store.listConversations(viewer)).map((c) => c.id)).toContain(conv.id);
	}
});

test("the first approval claims: the owner keeps it, the other agent loses it, the manager sees it", async () => {
	const conv = await guestWrites("g-claim");
	const begun = await store.beginAnswer({
		officeId: conv.officeId,
		conversationId: conv.id,
		inboundId: conv.unansweredInboundId!,
		text: "Hi",
		operatorId: "agent-1",
	});
	expect(begun.ok).toBe(true);
	expect((await store.getConversation(conv.id, agent("agent-1")))?.owner?.id).toBe("agent-1");
	expect(await store.getConversation(conv.id, agent("agent-2"))).toBeNull();
	expect((await store.listConversations(agent("agent-2"))).map((c) => c.id)).not.toContain(conv.id);
	expect((await store.getConversation(conv.id, manager))?.owner?.id).toBe("agent-1");
});

// ADR 0020: approve's lock on the conversation is `FOR KEY SHARE`, which the owner claim's
// update does not wait on, so two approvals still let one in and refuse the other.
test("two agents approving the same pool thread at once end with one owner and one in_progress", async () => {
	const conv = await guestWrites("g-race");
	const approve = (operatorId: string) =>
		store.beginAnswer({
			officeId: conv.officeId,
			conversationId: conv.id,
			inboundId: conv.unansweredInboundId!,
			text: `from ${operatorId}`,
			operatorId,
		});
	const [a, b] = await Promise.all([approve("agent-1"), approve("agent-2")]);
	expect([a, b].map((result) => (result.ok ? "ok" : result.reason)).sort()).toEqual([
		"in_progress",
		"ok",
	]);
	const winner = [a, b].filter((result) => result.ok);
	expect(winner).toHaveLength(1);
	const owner = (await store.getConversation(conv.id, manager))?.owner?.id;
	expect(owner).toBe(winner[0]!.ok ? winner[0]!.answer.operatorId : null);
});

test("an owner whose account ends leaves their threads to the pool", async () => {
	const conv = await guestWrites("g-leaver");
	await store.setOwner(conv.id, "agent-2", OFFICE);
	await testDb.user.upsert({
		where: { id: "leaver" },
		create: {
			id: "leaver",
			name: "Leaver",
			email: "leaver@test.nhip.local",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		update: {},
	});
	await member("leaver", "member");
	expect(await store.setOwner(conv.id, "leaver", OFFICE)).toBe(true);
	await testDb.user.delete({ where: { id: "leaver" } });
	const after = await store.getConversation(conv.id, agent("agent-1"));
	expect(after?.owner).toBeNull();
});

test("reassigning only to a member of the thread's office", async () => {
	const conv = await guestWrites("g-reassign");
	expect(await store.setOwner(conv.id, "agent-2", OFFICE)).toBe(true);
	expect(await store.setOwner(conv.id, "not-a-member", OFFICE)).toBe(false);
	expect(await store.setOwner(conv.id, null, OFFICE)).toBe(true);
	expect((await store.getConversation(conv.id, manager))?.owner).toBeNull();
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
