import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createInboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { oneShot } from "./draft";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { DEMO_THREADS, seedInbox } from "./seed";

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

test("seed writes invented threads once", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-"));
	setRuntimeForTests({
		store: createInboxStore(path.join(dir, "nhip.db")),
		sendMode: "mock",
		env: { SEND_MODE: "mock" },
	});
	const first = await seedInbox();
	expect(first.length).toBe(4);
	expect(first.every((conversation) => conversation.sentAt === null)).toBe(true);
	expect(first.every((conversation) => conversation.oneShot?.draft.reply)).toBe(true);
	const again = await seedInbox();
	expect(again.length).toBe(4);
	expect(again.reduce((n, conversation) => n + conversation.messages.length, 0)).toBe(
		first.reduce((n, conversation) => n + conversation.messages.length, 0),
	);
});
