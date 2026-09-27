import { conversationId, createInboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { type Runtime } from "../runtime";
import { resetTestInbox, testDb } from "../test-store";
import { CRM_TTL_MS, refreshCrm } from "./sync";
import type { CrmAdapter } from "./types";

const OFFICE = "office-a";
const store = createInboxStore(testDb);
afterEach(async () => {
	await store.close();
});

/** A CRM that counts its calls and answers from fixed data. */
function fakeCrm(
	outcomes: Record<string, "open" | "won" | "lost">,
	byPhone: Record<string, string>,
) {
	const calls = { find: 0, outcomes: 0 };
	const adapter: CrmAdapter = {
		kind: "mock",
		async findLeadForConversation({ guestId }) {
			calls.find += 1;
			const id = byPhone[guestId];
			return id ? { id, name: `Lead ${id}`, phone: null } : null;
		},
		searchLeads: async () => [],
		getLead: async () => null,
		async outcomesFor(ids) {
			calls.outcomes += 1;
			return Object.fromEntries(
				ids
					.filter((id) => outcomes[id])
					.map((id) => [id, { status: outcomes[id], at: null, reason: null }]),
			);
		},
	};
	return { adapter, calls };
}

function runtimeWith(adapter: CrmAdapter): Runtime {
	return { store, config: mockInboxConfig(), drafts: noDraftAdapter, crm: () => adapter };
}

const whatsapp = (guestId: string) => ({
	pipe: "whatsapp" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text: "hi",
	vendorMessageId: null,
});

test("an office without a CRM is left alone", async () => {
	await resetTestInbox();
	const { adapter, calls } = fakeCrm({}, {});
	expect(await refreshCrm(runtimeWith(adapter), OFFICE)).toEqual({ status: "none" });
	expect(calls).toEqual({ find: 0, outcomes: 0 });
});

test("unlinked threads are matched by phone, and outcomes are read in one batch", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	await store.upsertInbound(whatsapp("84900000000"), OFFICE);
	const { adapter, calls } = fakeCrm({ "lead-1": "won" }, { "84901234567": "lead-1" });
	const now = Date.now();
	expect(await refreshCrm(runtimeWith(adapter), OFFICE, now)).toEqual({ status: "ok", checked: 2 });
	const matched = await store.getConversation(conversationId(OFFICE, "whatsapp", "84901234567"));
	expect(matched?.crm).toMatchObject({ leadId: "lead-1", method: "phone", outcome: "won" });
	const missed = await store.getConversation(conversationId(OFFICE, "whatsapp", "84900000000"));
	expect(missed?.crm).toMatchObject({ leadId: null, method: "phone", outcome: null });
	expect(calls.outcomes).toBe(1);
});

test("inside the TTL nothing calls the CRM again, misses included", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84900000000"), OFFICE);
	await store.upsertInbound({ ...whatsapp("zalo-guest"), pipe: "zalo" }, OFFICE);
	const { adapter, calls } = fakeCrm({}, {});
	const now = Date.now();
	await refreshCrm(runtimeWith(adapter), OFFICE, now);
	const after = { ...calls };
	await refreshCrm(runtimeWith(adapter), OFFICE, now + CRM_TTL_MS - 1);
	expect(calls).toEqual(after);
	await refreshCrm(runtimeWith(adapter), OFFICE, now + CRM_TTL_MS + 1);
	expect(calls.find).toBeGreaterThan(after.find);
});

test("an agent's manual link or unlink is never overridden by phone matching", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId: null,
		leadName: null,
		method: "manual",
		checkedAt: new Date(0),
	});
	const { adapter, calls } = fakeCrm({}, { "84901234567": "lead-1" });
	await refreshCrm(runtimeWith(adapter), OFFICE);
	expect((await store.getConversation(id))?.crm).toMatchObject({ leadId: null, method: "manual" });
	expect(calls.find).toBe(0);
});

test("a CRM that throws keeps the cached outcomes and says so", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	const past = new Date(Date.now() - 2 * CRM_TTL_MS);
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId: "lead-1",
		leadName: "L",
		method: "phone",
		checkedAt: past,
	});
	await store.saveCrmOutcomes(
		[{ conversationId: id, outcome: "lost", outcomeAt: past, outcomeReason: "price" }],
		past,
	);
	const broken: CrmAdapter = {
		...fakeCrm({}, {}).adapter,
		outcomesFor: async () => {
			throw new Error("503 from CRM");
		},
	};
	expect(await refreshCrm(runtimeWith(broken), OFFICE)).toEqual({
		status: "failed",
		error: "503 from CRM",
	});
	expect((await store.getConversation(id))?.crm).toMatchObject({
		outcome: "lost",
		outcomeReason: "price",
	});
});

test("a lead the CRM no longer knows loses its outcome instead of being re-read forever", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	const past = new Date(Date.now() - 2 * CRM_TTL_MS);
	await store.saveCrmLink(id, {
		kind: "mock",
		leadId: "deleted",
		leadName: "D",
		method: "phone",
		checkedAt: past,
	});
	await store.saveCrmOutcomes(
		[{ conversationId: id, outcome: "won", outcomeAt: past, outcomeReason: null }],
		past,
	);
	const { adapter, calls } = fakeCrm({}, {});
	const now = Date.now();
	await refreshCrm(runtimeWith(adapter), OFFICE, now);
	expect((await store.getConversation(id))?.crm).toMatchObject({
		leadId: "deleted",
		outcome: null,
	});
	await refreshCrm(runtimeWith(adapter), OFFICE, now + 1000);
	expect(calls.outcomes).toBe(1);
});
