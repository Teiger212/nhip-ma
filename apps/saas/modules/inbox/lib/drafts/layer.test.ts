import { afterEach, beforeEach, expect, type MockInstance, test, vi } from "vitest";

import type { DraftInput, TranslateInput } from "./adapter";
import {
	type Attempt,
	createModelLayer,
	MODEL_TIMEOUT_MS,
	officeDay,
	type TaskBackend,
} from "./layer";

/**
 * The model layer's failures and log (ADR 0024): a 20 s timeout and one retry, then the
 * fallback; one log line per call with its task, model, office, tokens, latency and outcome,
 * and never message text or a thread or guest id.
 */

const GUEST_TEXT = "Hi, I'm Claire, call me on +84 912 345 678 about the Tay Ho flat";
const AGENT_TEXT = "Our office on Xuân Diệu has two options for you";
const THREAD_ID = "thread-b7c2f0a1d9e84c6aa1";

const TRANSLATE_INPUT: TranslateInput = {
	officeId: "office-a",
	text: GUEST_TEXT,
	from: "en",
	to: "vi",
};
const DRAFT_INPUT: DraftInput = {
	officeId: "office-a",
	guestName: "Claire Dubois",
	guestLanguage: "en",
	messages: [
		{ direction: "in", source: "guest", text: GUEST_TEXT, at: "2026-10-08T01:00:00.000Z" },
		{ direction: "out", source: "nhip", text: AGENT_TEXT, at: "2026-10-08T01:01:00.000Z" },
	],
	qualification: {
		areaOfInterest: "Tây Hồ",
		nationality: null,
		inVietnamNow: null,
		rentOrBuy: "rent",
		timeframe: null,
		budgetBand: null,
		bedsOrHousehold: null,
	},
	paperwork: { mentioned: false, flag: null },
};

const ok = (text: string): Attempt => ({ outcome: "ok", text, inputTokens: 210, outputTokens: 42 });

/** A backend that answers each call with the next of `answers`; "hang" never answers. */
function backend<Input>(model: string, answers: Array<Attempt | "hang" | Error>) {
	const calls: Input[] = [];
	const task: TaskBackend<Input> = {
		model,
		run: (input, signal) => {
			calls.push(input);
			const answer = answers[calls.length - 1] ?? answers.at(-1);
			if (answer === "hang") {
				// As fetch does: it gives up only when the signal aborts.
				return new Promise((_, reject) =>
					signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
				);
			}
			if (answer instanceof Error) return Promise.reject(answer);
			return Promise.resolve(answer as Attempt);
		},
	};
	return { task, calls };
}

let info: MockInstance<typeof console.info>;
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
	info = vi.spyOn(console, "info").mockImplementation(() => {});
	warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const allow = async () => true;
const CAPS = { draft: 50, translate: 1000 };

/** The model call lines, info and warn alike, in the order they were logged. */
function lines() {
	const logged = [info, warn].flatMap((spy) =>
		spy.mock.calls.map((args, index) => ({ order: spy.mock.invocationCallOrder[index], args })),
	);
	return logged
		.sort((a, b) => a.order - b.order)
		.map(({ args }) => args)
		.filter(([label]) => label === "model call");
}

test("a call that hasn't answered in 20 s is retried once, then the fallback stands", async () => {
	vi.useFakeTimers();
	const translate = backend<TranslateInput>("vendor/t", ["hang"]);
	const layer = createModelLayer({
		backends: { translate: translate.task },
		caps: CAPS,
		claim: allow,
	});

	const result = layer.translate(TRANSLATE_INPUT);
	await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS - 1);
	expect(translate.calls).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(translate.calls).toHaveLength(2);
	await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS);

	expect(await result).toBeNull();
	expect(translate.calls).toHaveLength(2);
	expect(lines().map(([, line]) => line.outcome)).toEqual(["timeout", "timeout"]);
	expect(lines().map(([, line]) => line.latencyMs)).toEqual([MODEL_TIMEOUT_MS, MODEL_TIMEOUT_MS]);
});

test("a second answer after a first failure is used", async () => {
	vi.useFakeTimers();
	const translate = backend<TranslateInput>("vendor/t", ["hang", ok("Xin chào")]);
	const draft = backend<DraftInput>("vendor/d", [{ outcome: "error", status: 502 }, ok("Sure.")]);
	const layer = createModelLayer({
		backends: { translate: translate.task, draft: draft.task },
		caps: CAPS,
		claim: allow,
	});

	const translated = layer.translate(TRANSLATE_INPUT);
	await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS);
	expect(await translated).toBe("Xin chào");
	expect(await layer.draft(DRAFT_INPUT)).toBe("Sure.");

	expect(translate.calls).toHaveLength(2);
	expect(draft.calls).toHaveLength(2);
	expect(lines().map(([, line]) => line.outcome)).toEqual(["timeout", "ok", "error", "ok"]);
});

test("each call logs one line: task, model, office, tokens, latency and outcome, and no text or ids", async () => {
	vi.useFakeTimers({ now: new Date("2026-10-08T03:00:00.000Z") });
	const translate = backend<TranslateInput>("vendor/t", [
		{ outcome: "error", status: 500 },
		ok(`Bản dịch: ${GUEST_TEXT}`),
	]);
	const draft = backend<DraftInput>("vendor/d", [
		{ outcome: "filtered", inputTokens: 300, outputTokens: 0 },
	]);
	const thrown = backend<DraftInput>("vendor/d", [
		new Error(`provider refused "${GUEST_TEXT}" in ${THREAD_ID}`),
	]);
	let calls = 0;
	const layer = createModelLayer({
		backends: { translate: translate.task, draft: draft.task },
		caps: CAPS,
		claim: async () => (calls += 1) <= 3,
	});

	await layer.translate(TRANSLATE_INPUT);
	await layer.draft(DRAFT_INPUT);
	// A fourth call is past the cap: logged, not made.
	await layer.draft(DRAFT_INPUT);
	await createModelLayer({ backends: { draft: thrown.task }, caps: CAPS, claim: allow }).draft(
		DRAFT_INPUT,
	);

	expect(lines().map(([, line]) => line)).toEqual([
		{
			task: "translate",
			model: "vendor/t",
			officeId: "office-a",
			inputTokens: null,
			outputTokens: null,
			latencyMs: 0,
			outcome: "error",
			status: 500,
		},
		{
			task: "translate",
			model: "vendor/t",
			officeId: "office-a",
			inputTokens: 210,
			outputTokens: 42,
			latencyMs: 0,
			outcome: "ok",
		},
		{
			task: "draft",
			model: "vendor/d",
			officeId: "office-a",
			inputTokens: 300,
			outputTokens: 0,
			latencyMs: 0,
			outcome: "filtered",
		},
		{
			task: "draft",
			model: "vendor/d",
			officeId: "office-a",
			inputTokens: null,
			outputTokens: null,
			latencyMs: 0,
			outcome: "capped",
		},
		{
			task: "draft",
			model: "vendor/d",
			officeId: "office-a",
			inputTokens: null,
			outputTokens: null,
			latencyMs: 0,
			outcome: "error",
			kind: "Error",
		},
		{
			task: "draft",
			model: "vendor/d",
			officeId: "office-a",
			inputTokens: null,
			outputTokens: null,
			latencyMs: 0,
			outcome: "error",
			kind: "Error",
		},
	]);
	const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
	for (const text of [GUEST_TEXT, "Claire", "+84", AGENT_TEXT, "Xuân Diệu", "Tây Hồ", THREAD_ID]) {
		expect(logged, text).not.toContain(text);
	}
});

test("a retry is a call: it counts against the cap, and a cap reached on it stops the retry", async () => {
	const translate = backend<TranslateInput>("vendor/t", [{ outcome: "error", status: 503 }]);
	const claims: string[] = [];
	const layer = createModelLayer({
		backends: { translate: translate.task },
		caps: CAPS,
		claim: async ({ task, cap }) => {
			claims.push(`${task}/${cap}`);
			return claims.length === 1;
		},
	});
	expect(await layer.translate(TRANSLATE_INPUT)).toBeNull();
	expect(claims).toEqual(["translate/1000", "translate/1000"]);
	expect(translate.calls).toHaveLength(1);
	expect(lines().map(([, line]) => line.outcome)).toEqual(["error", "capped"]);
});

test("a task with no model behind it is off: null at once, nothing counted, nothing logged", async () => {
	const claim = vi.fn(allow);
	const translate = backend<TranslateInput>("stub", [ok("Stub translation")]);
	const layer = createModelLayer({ backends: { translate: translate.task }, caps: CAPS, claim });
	expect(layer.serves("draft")).toBe(false);
	expect(await layer.draft(DRAFT_INPUT)).toBeNull();
	expect(claim).not.toHaveBeenCalled();
	expect(lines()).toEqual([]);
});

test("the office's day runs midnight to midnight in Asia/Ho_Chi_Minh: 17:00 UTC starts the next", () => {
	expect(officeDay(new Date("2026-10-08T16:59:59.999Z"))).toBe("2026-10-08");
	expect(officeDay(new Date("2026-10-08T17:00:00.000Z"))).toBe("2026-10-09");
	expect(officeDay(new Date("2026-10-07T17:00:00.000Z"))).toBe("2026-10-08");
});
