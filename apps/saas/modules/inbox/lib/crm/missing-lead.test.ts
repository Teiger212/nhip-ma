import type { InboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { testInboxStore } from "../test-store";
import type { Conversation } from "../types";
import { mockCrmAdapter } from "./mock";
import { createCrmSync } from "./sync";
import { CrmError } from "./types";

/**
 * #211: a thread whose lead write linked nothing says "Not in CRM yet", and opening it retries
 * the write, once a stored wait has passed. These are the write's rules with no user in them; the
 * chip and the heal on open are E2E (docs/e2e-scenarios.md, CRM).
 */

const OFFICE = "office-a";
const MINUTE = 60_000;
const threadUrl = (id: string) => `https://nhip.test/vi/inbox?thread=${encodeURIComponent(id)}`;

let store: InboxStore;
afterEach(async () => {
	await store?.close();
});

async function guestWrites(guestId: string, guestName: string): Promise<Conversation> {
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId,
			guestName,
			text: "Xin chào, tôi cần thuê căn hộ",
			vendorMessageId: null,
		},
		OFFICE,
	);
	return conversation;
}

/** The mock CRM, failing while `state.down`, counting the times Nhịp asks it for leads. */
function watchedCrm(state: { down: boolean; asked: number }) {
	return createCrmSync({
		store,
		threadUrl,
		adapterFor: (_connection, deps) => {
			const mock = mockCrmAdapter(deps.store, deps.officeId);
			return {
				...mock,
				findLeads: (identity) => {
					state.asked += 1;
					return state.down
						? Promise.reject(new CrmError("the CRM is down", "other"))
						: mock.findLeads(identity);
				},
			};
		},
	});
}

const later = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

const leadNameOf = async (conversation: Conversation) =>
	(await store.getOfficeConversation(OFFICE, conversation.id))?.crm?.leadName ?? null;

test("a failed lead write is remembered, so opening the thread before its wait is over asks the CRM nothing", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo-heal-1", "Thảo");
	const crm = { down: true, asked: 0 };

	await expect(watchedCrm(crm).newGuest(conversation)).rejects.toThrow();
	expect(crm.asked).toBe(1);

	// Another instance, the same stored wait: the inbox's 10 s polls ask the CRM nothing.
	crm.down = false;
	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(0.5))).toBe("waiting");
	expect(crm.asked).toBe(1);
	expect(await leadNameOf(conversation)).toBeNull();
});

test("once the wait is over, opening the thread writes the lead and links it, and the failure is forgotten", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo-heal-2", "Minh");
	const crm = { down: true, asked: 0 };
	await expect(watchedCrm(crm).newGuest(conversation)).rejects.toThrow();

	crm.down = false;
	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(1))).toBe("linked");

	expect(await leadNameOf(conversation)).toBe("Minh");
	expect((await store.findMockCrmLeads(OFFICE)).map((lead) => lead.name)).toEqual(["Minh"]);
	expect(await store.crmWriteFailure(OFFICE, conversation.id)).toBeNull();
});

test("a retry that fails again waits longer before the next", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo-heal-3", "Quân");
	const crm = { down: true, asked: 0 };
	await expect(watchedCrm(crm).newGuest(conversation)).rejects.toThrow();

	const retried = later(1);
	await expect(watchedCrm(crm).retryLead(OFFICE, conversation.id, retried)).rejects.toThrow();
	expect(crm.asked).toBe(2);
	expect(await store.crmWriteFailure(OFFICE, conversation.id)).toMatchObject({ attempts: 2 });

	// The second failure was stamped when it happened; the next try waits 5 minutes from then.
	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(4))).toBe("waiting");
	expect(crm.asked).toBe(2);
});

test("a guest matching two leads waits out the same backoff, rather than asking the CRM on every open", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	for (const name of ["Copy one", "Copy two"]) {
		await store.createMockCrmLead({
			officeId: OFFICE,
			name,
			phone: null,
			zaloUserId: "zalo-heal-4",
			pipe: "zalo",
			language: null,
			fields: null,
			threadUrl: "https://nhip.test/vi/inbox",
		});
	}
	const conversation = await guestWrites("zalo-heal-4", "Linh");
	const crm = { down: false, asked: 0 };

	await watchedCrm(crm).newGuest(conversation);
	expect(await leadNameOf(conversation)).toBeNull();
	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(0.5))).toBe("waiting");
	expect(crm.asked).toBe(1);
	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(1))).toBe("ambiguous");
	expect(crm.asked).toBe(2);
	expect(await store.findMockCrmLeads(OFFICE)).toHaveLength(2);
});

// ADR 0020: a deleted guest's thread takes its failure with it, and is never retried.
test("a deleted guest's thread is never retried", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo-heal-5", "Hà");
	const crm = { down: true, asked: 0 };
	await expect(watchedCrm(crm).newGuest(conversation)).rejects.toThrow();

	await store.deleteConversations(OFFICE, [conversation.id]);
	crm.down = false;

	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(60))).toBe("gone");
	expect(crm.asked).toBe(1);
	expect(await store.crmWriteFailure(OFFICE, conversation.id)).toBeNull();
	expect(await store.findMockCrmLeads(OFFICE)).toEqual([]);
});

test("a lead write that died half-way holds the thread only until it is stale, then opening it heals", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo-heal-6", "Yuki");
	// A write claimed the thread and its function was killed before it linked or let go.
	expect(await store.claimCrmLink(OFFICE, conversation.id, new Date(0))).toBe(true);
	const crm = { down: false, asked: 0 };

	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(1))).toBe("busy");
	expect(crm.asked).toBe(0);
	expect(await watchedCrm(crm).retryLead(OFFICE, conversation.id, later(16))).toBe("linked");
	expect(await leadNameOf(conversation)).toBe("Yuki");
});

test("a thread already in the CRM, or in an office with no CRM, is not retried", async () => {
	store = await testInboxStore();
	const noCrm = await guestWrites("zalo-heal-7", "An");
	const crm = { down: false, asked: 0 };
	expect(await watchedCrm(crm).retryLead(OFFICE, noCrm.id, later(60))).toBe("none");

	await store.setCrmConnection(OFFICE, "mock");
	const linked = await guestWrites("zalo-heal-8", "Bảo");
	await watchedCrm(crm).newGuest(linked);
	expect(crm.asked).toBe(1);
	expect(await watchedCrm(crm).retryLead(OFFICE, linked.id, later(60))).toBe("none");
	expect(crm.asked).toBe(1);
});

test("choosing another CRM for the office forgets its failed writes", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const conversation = await guestWrites("zalo-heal-9", "Lan");
	await expect(watchedCrm({ down: true, asked: 0 }).newGuest(conversation)).rejects.toThrow();
	expect(await store.crmWriteFailure(OFFICE, conversation.id)).not.toBeNull();

	await store.setCrmConnection(OFFICE, null);
	await store.setCrmConnection(OFFICE, "mock");

	expect(await store.crmWriteFailure(OFFICE, conversation.id)).toBeNull();
});
