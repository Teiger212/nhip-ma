import { afterEach, expect, test } from "vitest";

import { createCrmSync } from "./crm/sync";
import { testDb, testInboxStore } from "./test-store";

/**
 * ADR 0010 (amended by #141): a thread's id is opaque. The guest's phone number or Zalo id is
 * stored once, on the thread (`guestId`, beside `guestName`); no thread id, Answer, vendor
 * message id or thread link carries it. Clearing those two fields then leaves nothing that
 * says who the guest was (guest deletion, #138).
 */
const OFFICE = "office-a";
const PHONE = "84901234567";
/** WhatsApp message ids carry the guest's number in Meta's format; these are shaped like them. */
const INBOUND_WAMID = `wamid.HBgL${PHONE}FQIAEhgUM0FCQjI`;
const REPLY_WAMID = `wamid.HBgL${PHONE}FQIAERgSNUQ5RTE`;
const threadUrl = (id: string) => `https://nhip.test/vi/inbox?thread=${encodeURIComponent(id)}`;

let store: Awaited<ReturnType<typeof testInboxStore>>;
afterEach(async () => {
	await store?.close();
});

test("no stored thread id, answer or vendor-id column contains the guest's id", async () => {
	store = await testInboxStore();
	await store.setCrmConnection(OFFICE, "mock");
	const written = (
		await store.upsertInbound(
			{
				pipe: "whatsapp",
				source: "guest",
				guestId: PHONE,
				guestName: "Minh",
				text: "Hello, I'm looking for a flat",
				vendorMessageId: INBOUND_WAMID,
				pipeExternalId: "office-number-1",
			},
			OFFICE,
		)
	).conversation;
	// The vendor retries the same message: still one message (the dedupe works on what is stored).
	const thread = (
		await store.upsertInbound(
			{
				pipe: "whatsapp",
				source: "guest",
				guestId: PHONE,
				guestName: "Minh",
				text: "Hello, I'm looking for a flat",
				vendorMessageId: INBOUND_WAMID,
				pipeExternalId: "office-number-1",
			},
			OFFICE,
		)
	).conversation;
	expect(thread.id).toBe(written.id);
	expect(thread.messages).toHaveLength(1);
	await store.setOneShot(OFFICE, thread.id, {
		language: "en",
		qualification: {
			areaOfInterest: null,
			nationality: null,
			inVietnamNow: null,
			rentOrBuy: "rent",
			timeframe: null,
			budgetBand: null,
			bedsOrHousehold: null,
		},
		paperwork: { mentioned: false, flag: null },
		draft: { reply: "Hi Minh", answersMessageId: thread.unansweredInboundId, source: "template" },
	});
	await createCrmSync({ store, threadUrl }).newGuest(thread);
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId: thread.id,
		inboundId: thread.unansweredInboundId!,
		text: "Hi Minh, which area?",
		operatorId: "agent-1",
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	await store.completeAnswer(OFFICE, begun.answer.id, {
		mock: false,
		pipe: "whatsapp",
		vendorMessageId: REPLY_WAMID,
	});
	await store.recordWebhookDelivery({
		pipe: "whatsapp",
		outcome: "processed",
		endpoints: ["office-number-1"],
		officeIds: [OFFICE],
		filed: 1,
		dropped: 0,
		vendorMessageIds: [INBOUND_WAMID],
		errorKind: null,
	});

	// The one place the guest's id lives: the thread's guestId.
	expect(
		await testDb.conversation.count({ where: { officeId: OFFICE, guestId: PHONE } }),
		"the thread keeps who the guest is in guestId",
	).toBe(1);

	// Every other stored row of the thread, whole; the thread itself without guestId/guestName.
	// The mock CRM stands in for the office's CRM, which holds the guest's number by design;
	// only the link Nhịp writes on the lead is ours.
	const rows = await testDb.$queryRaw<{ source: string; row: unknown }[]>`
		SELECT 'conversation' AS "source", to_jsonb(c) - 'guestId' - 'guestName' AS "row"
			FROM "inbox_conversation" c
		UNION ALL SELECT 'message', to_jsonb(m) FROM "inbox_message" m
		UNION ALL SELECT 'answer', to_jsonb(a) FROM "inbox_answer" a
		UNION ALL SELECT 'qualification', to_jsonb(q) FROM "inbox_qualification" q
		UNION ALL SELECT 'draft', to_jsonb(d) FROM "inbox_draft" d
		UNION ALL SELECT 'paperwork', to_jsonb(p) FROM "inbox_paperwork" p
		UNION ALL SELECT 'crm link', to_jsonb(k) FROM "inbox_crm_link" k
		UNION ALL SELECT 'webhook delivery', to_jsonb(w) FROM "inbox_webhook_delivery" w
		UNION ALL SELECT 'lead thread link', jsonb_build_object('threadUrl', l."threadUrl")
			FROM "inbox_mock_crm_lead" l
	`;
	expect(
		new Set(rows.map((r) => r.source)),
		"every table under test holds a row of this guest's",
	).toEqual(
		new Set([
			"conversation",
			"message",
			"answer",
			"qualification",
			"draft",
			"paperwork",
			"crm link",
			"webhook delivery",
			"lead thread link",
		]),
	);
	const leaks = rows.flatMap(({ source, row }) => {
		const stored = JSON.stringify(row);
		return [
			...(stored.includes(PHONE) ? [`${source}: the guest's phone number`] : []),
			...(stored.includes("wamid.") ? [`${source}: a raw WhatsApp message id`] : []),
		];
	});
	expect(leaks, "no row but the thread's guestId says who the guest is").toEqual([]);
});
