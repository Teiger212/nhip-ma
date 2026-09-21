import { createInboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { mockInboxConfig } from "./config";
import { oneShot } from "./draft";
import { noDraftAdapter } from "./drafts";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { DEMO_THREADS, seedInbox } from "./seed";
import { resetTestInbox, testDb } from "./test-store";
import { WALK_OFFICE_ID } from "./walk-user";

afterEach(async () => {
	const runtime = peekTestRuntime();
	if (runtime) {
		await runtime.store.close();
	}
	setRuntimeForTests(null);
});

test("demo threads extract; Japanese paperwork does not invent law", () => {
	const [ko, jp, ru, vi] = DEMO_THREADS.map((thread) => oneShot(thread.text));

	expect(ko.language).toBe("ko");
	expect(ko.qualification.nationality).toBe("Korean");
	expect(ko.qualification.areaOfInterest).toBe("Tây Hồ");
	expect(ko.qualification.rentOrBuy).toBe("rent");
	expect(ko.qualification.timeframe).toBe("this Friday");
	expect(ko.qualification.bedsOrHousehold).toBe("2 bed");
	expect(ko.paperwork.mentioned).toBe(false);

	expect(jp.language).toBe("ja");
	expect(jp.qualification.nationality).toBe("Japanese");
	expect(jp.qualification.rentOrBuy).toBe("buy");
	expect(jp.paperwork.mentioned).toBe(true);
	expect(jp.draft.reply).not.toMatch(/you (can|will) (get|receive) a pink book/i);
	expect(jp.draft.reply).not.toMatch(/tomorrow/i);

	expect(ru.language).toBe("ru");
	expect(ru.qualification.nationality).toBe("Russian");
	expect(ru.qualification.areaOfInterest).toBe("Ciputra");
	expect(ru.qualification.rentOrBuy).toBe("rent");

	expect(vi.language).toBe("vi");
	expect(vi.qualification.areaOfInterest).toBe("Tây Hồ");
	expect(vi.qualification.rentOrBuy).toBe("rent");
	expect(vi.qualification.timeframe).toBe("đầu tháng 9");
	expect(vi.qualification.bedsOrHousehold).toBe("2 bed");
});

test("seed finds an existing thread by guest and does not write it twice", async () => {
	await resetTestInbox();
	const store = createInboxStore(testDb);
	setRuntimeForTests({ store, config: mockInboxConfig(), drafts: noDraftAdapter });
	const earlier = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId: "demo-vi-tayho",
			guestName: "Thảo",
			text: "old message",
			vendorMessageId: null,
		},
		WALK_OFFICE_ID,
	);
	const seeded = await seedInbox(WALK_OFFICE_ID);
	expect(seeded).toHaveLength(4);
	const thao = seeded.find((conversation) => conversation.guestId === "demo-vi-tayho");
	expect(thao?.id).toBe(earlier.id);
	expect(thao?.messages.map((message) => message.text)).toEqual(["old message"]);
	expect(await store.listConversations({ userId: "seed", officeId: WALK_OFFICE_ID })).toHaveLength(
		4,
	);
});

test("seed writes invented threads once", async () => {
	await resetTestInbox();
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: noDraftAdapter,
	});
	const first = await seedInbox(WALK_OFFICE_ID);
	expect(first.length).toBe(4);
	expect(first.every((conversation) => conversation.officeId === WALK_OFFICE_ID)).toBe(true);
	expect(
		first
			.map((conversation) => conversation.guestName)
			.sort((a, b) => (a ?? "").localeCompare(b ?? "")),
	).toEqual(["Alexei", "Minji", "Thảo", "Yuki"]);
	expect(first.every((conversation) => conversation.sentAt === null)).toBe(true);
	expect(first.every((conversation) => conversation.unansweredInboundId !== null)).toBe(true);
	expect(first.every((conversation) => conversation.oneShot?.draft.reply)).toBe(true);
	expect(
		first.every(
			(conversation) =>
				conversation.oneShot?.draft.answersMessageId === conversation.unansweredInboundId,
		),
	).toBe(true);
	expect(first.every((conversation) => conversation.messages.length === 1)).toBe(true);
	const byId = (a: string, b: string) => a.localeCompare(b);
	const firstIds = first.map((conversation) => conversation.id).sort(byId);
	const again = await seedInbox(WALK_OFFICE_ID);
	expect(again.map((conversation) => conversation.id).sort(byId)).toEqual(firstIds);
	expect(again.reduce((n, conversation) => n + conversation.messages.length, 0)).toBe(4);
});
