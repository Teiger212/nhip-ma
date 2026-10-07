import { beforeEach, expect, test } from "vitest";

import { account, guestMessage, membership } from "./test-fixtures";
import { testInboxStore } from "./test-store";
import type { Store } from "./types";

/**
 * A manager assigns a thread to an operator of the office, never to the platform admin
 * (ADR 0022, #174): their kit `owner` membership is inert (ADR 0015), so a thread given to them
 * would be seen and alerted by no one.
 */
const OFFICE = "office-a";
const PLATFORM_ADMIN = "platform-admin-owner-pa";

let store: Store;

beforeEach(async () => {
	store = await testInboxStore();
	await account(PLATFORM_ADMIN, { role: "admin" });
	await membership(OFFICE, PLATFORM_ADMIN, "owner");
	await membership(OFFICE, "agent-1", "member");
});

test("a thread can't be given to the platform admin, though they hold a membership", async () => {
	const { conversation } = await store.upsertInbound(
		guestMessage("g-platform-admin", {
			pipe: "whatsapp",
			guestName: "Guest",
			text: "Hello",
			pipeExternalId: "phone-a",
		}),
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
