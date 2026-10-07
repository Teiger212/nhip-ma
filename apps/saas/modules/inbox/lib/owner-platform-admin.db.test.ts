import { beforeEach, expect, test } from "vitest";

import { testDb, testInboxStore } from "./test-store";
import type { Store } from "./types";

/**
 * A manager assigns a thread to an operator of the office, never to the platform admin
 * (ADR 0022, #174): their kit `owner` membership is inert (ADR 0015), so a thread given to them
 * would be seen and alerted by no one.
 */
const OFFICE = "office-a";
const PLATFORM_ADMIN = "platform-admin-owner-pa";

let store: Store;

async function user(id: string, role: string) {
	await testDb.user.upsert({
		where: { id },
		create: {
			id,
			name: id,
			email: `${id}@test.nhip.local`,
			emailVerified: true,
			role,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		update: { role },
	});
}

async function member(userId: string, role: string) {
	await testDb.member.upsert({
		where: { organizationId_userId: { organizationId: OFFICE, userId } },
		create: { id: `m-${userId}`, organizationId: OFFICE, userId, role, createdAt: new Date() },
		update: { role },
	});
}

beforeEach(async () => {
	store = await testInboxStore();
	await testDb.member.deleteMany({ where: { organizationId: OFFICE } });
	await user(PLATFORM_ADMIN, "admin");
	await member(PLATFORM_ADMIN, "owner");
	await member("agent-1", "member");
});

test("a thread can't be given to the platform admin, though they hold a membership", async () => {
	const { conversation } = await store.upsertInbound(
		{
			pipe: "whatsapp",
			source: "guest",
			guestId: "g-platform-admin",
			guestName: "Guest",
			text: "Hello",
			vendorMessageId: null,
			pipeExternalId: "phone-a",
		},
		OFFICE,
	);
	expect(await store.setOwner(conversation.id, PLATFORM_ADMIN, OFFICE)).toBe(false);
	expect(await store.setOwner(conversation.id, "agent-1", OFFICE)).toBe(true);
	expect(await store.setOwner(conversation.id, PLATFORM_ADMIN, OFFICE)).toBe(false);
	const after = await store.getConversation(conversation.id, {
		userId: "agent-1",
		officeId: OFFICE,
		role: "agent",
	});
	expect(after?.owner?.id).toBe("agent-1");
});
