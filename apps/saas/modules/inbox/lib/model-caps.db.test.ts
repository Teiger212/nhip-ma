import { createInboxStore, type InboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { testDb } from "./test-store";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", () => ({
	// The office's manager, who reaches every thread, Unassigned included (ADR 0022).
	getOrganizationMembershipsForUser: vi.fn(async () => [
		{ organizationId: "walk-office", role: "admin" },
	]),
}));

import { auth } from "@repo/auth";

import { POST as regenerate } from "../../../app/api/conversations/[id]/draft/route";
import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { settleBackgroundWork } from "./background";
import { mockInboxConfig, validateInboxEnv } from "./config";
import { CAPPED, type DraftAdapter, type DraftInput, draftAdapterFromConfig } from "./drafts";
import { officeDay } from "./drafts/layer";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { json, params, post, WALK_SESSION } from "./test-fixtures";
import type { Conversation } from "./types";

/**
 * The daily caps per office (ADR 0024), counted in the database: drafts 50 a day, Regenerate
 * included, translations 1,000 a day. Past a cap the task falls back without calling the model.
 * The day runs midnight to midnight in Asia/Ho_Chi_Minh, and each office counts its own.
 */

const DRAFTER = "test/drafter";
const TRANSLATOR = "test/translator";

/** The models the stubbed OpenRouter was asked for, one entry per request. */
const requested: string[] = [];

let store: InboxStore;

beforeEach(() => {
	requested.length = 0;
	store = createInboxStore(testDb);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: RequestInit) => {
			requested.push((JSON.parse(init.body as string) as { model: string }).model);
			return Response.json({
				choices: [{ message: { content: "Happy to help." }, finish_reason: "stop" }],
				usage: { prompt_tokens: 100, completion_tokens: 10 },
			});
		}),
	);
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
	await settleBackgroundWork();
	const runtime = peekTestRuntime();
	if (runtime) await runtime.store.close();
	setRuntimeForTests(null);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** The model layer as production builds it: OpenRouter for both tasks, no cap env vars set. */
function layerAt(now?: Date | (() => Date)): DraftAdapter {
	const result = validateInboxEnv({
		NODE_ENV: "test",
		NEXT_PUBLIC_SAAS_URL: "http://localhost:3010",
		BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-for-validation!",
		DRAFT_API_KEY: "sk-test",
		DRAFT_MODEL: DRAFTER,
		TRANSLATE_MODEL: TRANSLATOR,
	});
	if (!result.ok) throw new Error(result.errors.join("\n"));
	return draftAdapterFromConfig(result.config, {
		claim: store.claimModelCall,
		now: now instanceof Date ? () => now : now,
	});
}

function draftInput(officeId: string): DraftInput {
	return {
		officeId,
		guestName: null,
		guestLanguage: "en",
		messages: [{ direction: "in", source: "guest", text: "Hello", at: "2026-10-08T01:00:00.000Z" }],
		qualification: {
			areaOfInterest: null,
			nationality: null,
			inVietnamNow: null,
			rentOrBuy: null,
			timeframe: null,
			budgetBand: null,
			bedsOrHousehold: null,
		},
		paperwork: { mentioned: false, flag: null },
	};
}

const TASKS = [
	{
		task: "draft",
		cap: 50,
		model: DRAFTER,
		call: (layer: DraftAdapter, officeId: string) => layer.draft(draftInput(officeId)),
	},
	{
		task: "translate",
		cap: 1000,
		model: TRANSLATOR,
		call: (layer: DraftAdapter, officeId: string) =>
			layer.translate({ officeId, text: "Xin chào", from: "vi", to: "en" }),
	},
] as const;

/** The office's calls that day so far, as if it had made them. */
async function used(officeId: string, task: string, day: string, calls: number): Promise<void> {
	await testDb.modelUsage.create({ data: { officeId, task, day: new Date(day), calls } });
}

async function callsOn(officeId: string, task: string, day: string): Promise<number | null> {
	const row = await testDb.modelUsage.findUnique({
		where: { officeId_day_task: { officeId, task, day: new Date(day) } },
	});
	return row?.calls ?? null;
}

const MORNING = new Date("2026-10-08T03:00:00.000Z"); // 10:00 in Hà Nội

describe.each(TASKS)("the $task cap of $cap a day", ({ task, cap, model, call }) => {
	test(`the ${cap}th call of the office's day goes to the model, the next doesn't`, async () => {
		await used("office-a", task, "2026-10-08", cap - 1);
		const layer = layerAt(MORNING);

		expect(await call(layer, "office-a")).toBe("Happy to help.");
		expect(requested).toEqual([model]);
		expect(await callsOn("office-a", task, "2026-10-08")).toBe(cap);

		expect(await call(layer, "office-a")).toBe(CAPPED);
		expect(requested).toEqual([model]);
		expect(await callsOn("office-a", task, "2026-10-08")).toBe(cap);
	});

	test("a new day in Asia/Ho_Chi_Minh, at 17:00 UTC, starts a new count", async () => {
		await used("office-a", task, "2026-10-08", cap);

		expect(await call(layerAt(new Date("2026-10-08T16:59:59.000Z")), "office-a")).toBe(CAPPED);
		expect(requested).toEqual([]);

		expect(await call(layerAt(new Date("2026-10-08T17:00:00.000Z")), "office-a")).toBe(
			"Happy to help.",
		);
		expect(requested).toEqual([model]);
		expect(await callsOn("office-a", task, "2026-10-09")).toBe(1);
	});

	test("another office's count is its own", async () => {
		await used("office-a", task, "2026-10-08", cap);
		const layer = layerAt(MORNING);

		expect(await call(layer, "office-a")).toBe(CAPPED);
		expect(await call(layer, "office-b")).toBe("Happy to help.");
		expect(requested).toEqual([model]);
		expect(await callsOn("office-b", task, "2026-10-08")).toBe(1);
		expect(await callsOn("office-a", task, "2026-10-08")).toBe(cap);
	});
});

test("the two tasks count apart: drafts at their cap leave translations running", async () => {
	await used("office-a", "draft", "2026-10-08", 50);
	const layer = layerAt(MORNING);
	expect(await layer.draft(draftInput("office-a"))).toBe(CAPPED);
	expect(
		await layer.translate({ officeId: "office-a", text: "Xin chào", from: "vi", to: "en" }),
	).toBe("Happy to help.");
	expect(requested).toEqual([TRANSLATOR]);
});

test("Regenerate counts: the 50th of the day is the model's, the 51st puts the template back", async () => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	// With the auto-reply off, nothing drafts on its own: only Regenerate calls the draft model.
	await testDb.officeSetting.create({ data: { officeId: "walk-office", autoReply: false } });
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: layerAt(MORNING),
	});
	const injected = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "whatsapp",
				guestId: "regen-cap",
				text: "Is the Ciputra flat still available?",
			}),
		),
	);
	const conv = injected.body.conversation as Conversation;
	await settleBackgroundWork();
	const today = officeDay(MORNING);
	await used("walk-office", "draft", today, 49);

	const first = await json(
		await regenerate(
			post(`http://localhost/api/conversations/${conv.id}/draft`, {}),
			params(conv.id),
		),
	);
	expect(first.status).toBe(200);
	expect((first.body.conversation as Conversation).oneShot?.draft).toMatchObject({
		reply: "Happy to help.",
		source: "model",
	});
	expect(await callsOn("walk-office", "draft", today)).toBe(50);

	const second = await json(
		await regenerate(
			post(`http://localhost/api/conversations/${conv.id}/draft`, {}),
			params(conv.id),
		),
	);
	expect(second.status).toBe(200);
	expect((second.body.conversation as Conversation).oneShot?.draft.source).toBe("template");
	expect(requested.filter((model) => model === DRAFTER)).toHaveLength(1);
	expect(await callsOn("walk-office", "draft", today)).toBe(50);
});

// ADR 0024: past the cap the task falls back; a capped translation isn't a failed one (#257).
test("a translation past the office's cap uses none of its attempts, and lands once the office's day turns", async () => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	await testDb.officeSetting.create({ data: { officeId: "walk-office", autoReply: false } });
	// Late evening in Hà Nội, with the office's 1,000 translations of the day spent.
	let clock = new Date("2026-10-08T15:30:00.000Z");
	await used("walk-office", "translate", "2026-10-08", 1000);
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: layerAt(() => clock),
	});

	const injected = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "zalo",
				guestId: "capped-translation",
				text: "안녕하세요. Tay Ho에서 2 bedroom 임대 찾고 있어요.",
			}),
		),
	);
	const conv = injected.body.conversation as Conversation;
	const messageId = conv.messages[0].id;
	await settleBackgroundWork();

	/** One open of the thread in Vietnamese, as the agent does. */
	async function open(): Promise<Conversation> {
		const res = await getConversation(
			new Request(`http://localhost/api/conversations/${encodeURIComponent(conv.id)}?locale=vi`),
			params(conv.id),
		);
		expect(res.status).toBe(200);
		await settleBackgroundWork();
		return (await res.json()) as Conversation;
	}

	// More opens than a translation's failures allow: still capped, no model call, nothing spent.
	for (let opened = 0; opened < 6; opened += 1) await open();
	expect(requested).toEqual([]);
	expect(
		await testDb.translationFailure.findMany({ where: { messageId } }),
		"a capped translation is not recorded as a failed one",
	).toEqual([]);
	expect((await open()).messages[0].translations.vi).toBeUndefined();

	// Midnight in Hà Nội: the next open translates it.
	clock = new Date("2026-10-08T17:00:00.000Z");
	await open();
	expect(requested).toContain(TRANSLATOR);
	expect((await open()).messages[0].translations.vi).toBe("Happy to help.");
});
