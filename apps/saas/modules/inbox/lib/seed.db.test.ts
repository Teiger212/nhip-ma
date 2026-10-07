import { createInboxStore } from "@repo/database/inbox";
import { afterEach, expect, test, vi } from "vitest";

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import { oneShot } from "./draft";
import { noDraftAdapter } from "./drafts";
import { isQuiet } from "./queue";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { DEMO_THREADS, seedInbox } from "./seed";
import { account, guestMessage, membership } from "./test-fixtures";
import { testDb, useTestDatabaseForAppClient } from "./test-store";
import { WALK_OFFICE_ID } from "./walk-user";

// Web push stubbed at its boundary: the seed must never reach it (#134, Q3).
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ sendNotification, default: { sendNotification } }));

useTestDatabaseForAppClient();

afterEach(async () => {
	// Alerts follow a guest message in the background (ADR 0019); they finish before the reset.
	await settleBackgroundWork();
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
	const store = createInboxStore(testDb);
	setRuntimeForTests({ store, config: mockInboxConfig(), drafts: noDraftAdapter });
	const earlier = (
		await store.upsertInbound(
			guestMessage("demo-vi-tayho", { guestName: "Thảo", text: "old message" }),
			WALK_OFFICE_ID,
		)
	).conversation;
	const seeded = await seedInbox(WALK_OFFICE_ID);
	expect(seeded).toHaveLength(4);
	const thao = seeded.find((conversation) => conversation.guestId === "demo-vi-tayho");
	expect(thao?.id).toBe(earlier.id);
	expect(thao?.messages.map((message) => message.text)).toEqual(["old message"]);
	expect(
		await store.listConversations({ userId: "seed", officeId: WALK_OFFICE_ID, role: "manager" }),
	).toHaveLength(4);
});

test("seed writes invented threads once", async () => {
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

test("the fresh pair lands in Your turn, the other two in Quiet", async () => {
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: noDraftAdapter,
	});
	const now = Date.now();
	const seeded = await seedInbox(WALK_OFFICE_ID, { now });
	const quiet = seeded
		.filter((conversation) => isQuiet(conversation, now))
		.map((conversation) => conversation.guestName)
		.sort((a, b) => (a ?? "").localeCompare(b ?? ""));
	expect(quiet).toEqual(["Alexei", "Yuki"]);
});

test("reset rewrites the demo threads as of now", async () => {
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: noDraftAdapter,
	});
	const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
	await seedInbox(WALK_OFFICE_ID, { now: threeDaysAgo });
	const now = Date.now();
	const reseeded = await seedInbox(WALK_OFFICE_ID, { reset: true, now });
	expect(reseeded).toHaveLength(4);
	expect(reseeded.every((conversation) => conversation.messages.length === 1)).toBe(true);
	const minji = reseeded.find((conversation) => conversation.guestName === "Minji");
	expect(minji && isQuiet(minji, now)).toBe(false);
});

// #134, Q3: `pnpm seed` writes guest messages, and those alert; a seed run must never push to a
// real device, whatever SEND_MODE says. The alerts are still decided and logged.
test("seeding never pushes, even live with VAPID keys and a manager's device", async () => {
	const store = createInboxStore(testDb);
	// A manager of the walk office alone (a member of two offices is alerted by neither).
	const manager = "seed-push-manager";
	await account(manager);
	await membership(WALK_OFFICE_ID, manager, "admin");
	await testDb.pushSubscription.create({
		data: {
			userId: manager,
			sessionId: "session-manager",
			endpoint: "https://fcm.googleapis.com/fcm/send/the-managers-real-phone",
			p256dh: "p256dh",
			auth: "auth",
		},
	});
	sendNotification.mockReset();
	sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
	const vapid = {
		publicKey: "BPub-vitest",
		privateKey: "priv-vitest",
		subject: "mailto:a@nhip.local",
	};
	setRuntimeForTests({
		store,
		config: mockInboxConfig({ sendMode: "live", vapid }),
		drafts: noDraftAdapter,
	});

	await seedInbox(WALK_OFFICE_ID, { reset: true });
	await settleBackgroundWork();

	expect(
		await testDb.inboxAlert.count({ where: { officeId: WALK_OFFICE_ID, userId: manager } }),
	).toBe(DEMO_THREADS.length);
	expect(sendNotification).not.toHaveBeenCalled();
});
