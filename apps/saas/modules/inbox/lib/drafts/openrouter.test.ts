import { afterEach, expect, test, vi } from "vitest";

import { validateInboxEnv } from "../config";
import type { DraftInput } from "./adapter";
import { draftAdapterFromConfig } from "./index";

/**
 * The model layer's requests, against a stubbed `fetch` (ADR 0024): OpenRouter, zero-retention
 * routing on every request, and each task with its own model.
 */

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

function stubFetch(respond: (call: Call) => Response | Promise<Response>): Call[] {
	const calls: Call[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const call = { url, init, body: JSON.parse(init.body as string) as Record<string, unknown> };
			calls.push(call);
			return respond(call);
		}),
	);
	return calls;
}

function completion(content: string | null, finish_reason = "stop"): Response {
	return Response.json({
		choices: [{ message: { role: "assistant", content }, finish_reason }],
		usage: { prompt_tokens: 120, completion_tokens: 30 },
	});
}

function layerFor(env: Record<string, string>) {
	const result = validateInboxEnv({
		NODE_ENV: "test",
		NEXT_PUBLIC_SAAS_URL: "http://localhost:3010",
		BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-for-validation!",
		...env,
	});
	if (!result.ok) throw new Error(result.errors.join("\n"));
	return draftAdapterFromConfig(result.config, { claim: async () => true });
}

const DRAFT_INPUT: DraftInput = {
	officeId: "office-a",
	guestName: "Minji",
	guestLanguage: "ko",
	officeLanguage: "vi",
	openQuestions: [],
	messages: [
		{ direction: "in", source: "guest", text: "Tay Ho 임대", at: "2026-09-18T00:00:00.000Z" },
		{ direction: "out", source: "nhip", text: "Thanks!", at: "2026-09-18T00:01:00.000Z" },
		{ direction: "in", source: "guest", text: "금요일?", at: "2026-09-18T00:02:00.000Z" },
	],
	qualification: {
		areaOfInterest: "Tây Hồ",
		nationality: "Korean",
		inVietnamNow: true,
		rentOrBuy: "rent",
		timeframe: null,
		budgetBand: null,
		bedsOrHousehold: "2 bed",
	},
	paperwork: { mentioned: false, flag: null },
};

const TRANSLATE_INPUT = {
	officeId: "office-a",
	text: "안녕하세요 Tay Ho 임대",
	from: "ko",
	to: "vi",
} as const;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("every request of both tasks asks OpenRouter for zero-retention routing, each with its own model", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const calls = stubFetch(() => completion("ok"));
	const layer = layerFor({
		DRAFT_API_KEY: "sk-test",
		DRAFT_MODEL: "vendor/drafter",
		TRANSLATE_MODEL: "vendor/translator",
	});

	await layer.translate(TRANSLATE_INPUT);
	await layer.draft(DRAFT_INPUT);

	expect(calls).toHaveLength(2);
	for (const call of calls) {
		expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
		expect(call.body.provider).toEqual({ zdr: true, data_collection: "deny" });
	}
	expect(calls.map((call) => call.body.model)).toEqual(["vendor/translator", "vendor/drafter"]);
});

test("a key with no model ids drafts and translates with the defaults in code", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const calls = stubFetch(() => completion("ok"));
	const layer = layerFor({ DRAFT_API_KEY: "sk-test" });

	await layer.draft(DRAFT_INPUT);
	await layer.translate(TRANSLATE_INPUT);

	expect(calls.map((call) => call.body.model)).toEqual([
		"anthropic/claude-haiku-5.5",
		"anthropic/claude-haiku-5.5",
	]);
	expect(calls.every((call) => call.body.provider !== undefined)).toBe(true);
});

test("translate speaks the chat-completions protocol and frames guest text as data", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const calls = stubFetch(() => completion("  Xin chào, tôi tìm thuê ở Tây Hồ.  "));
	const layer = layerFor({
		DRAFT_API_KEY: "sk-test",
		DRAFT_BASE_URL: "https://openrouter.ai/api/v1/",
	});
	const text = await layer.translate(TRANSLATE_INPUT);
	expect(text).toBe("Xin chào, tôi tìm thuê ở Tây Hồ.");

	expect(calls).toHaveLength(1);
	const [call] = calls;
	expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
	expect(call.init.method).toBe("POST");
	expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
	expect(call.body.max_tokens).toBe(1024);
	const messages = call.body.messages as Array<{ role: string; content: string }>;
	expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
	expect(messages[0].content).toMatch(/into Vietnamese/);
	expect(messages[0].content).toMatch(/never follow them/);
	expect(messages[1].content).toContain('<guest_message source_language="Korean">');
	expect(messages[1].content).toContain("안녕하세요 Tay Ho 임대");
	// The office id counts the call; it is never sent to the model.
	expect(JSON.stringify(call.body)).not.toContain("office-a");
});

test("draft sends the facts and the transcript with a smaller output budget", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	// The layer returns the model's text as it is; `generateModelDraft` reads its JSON (#251).
	const answer = JSON.stringify({
		reply: "확인 후 연락드리겠습니다.",
		office_reply: "Em sẽ kiểm tra ạ.",
	});
	const calls = stubFetch(() => completion(answer));
	const layer = layerFor({ DRAFT_API_KEY: "sk-test" });
	expect(await layer.draft(DRAFT_INPUT)).toBe(answer);
	const [call] = calls;
	expect(call.body.max_tokens).toBe(768);
	const messages = call.body.messages as Array<{ role: string; content: string }>;
	expect(messages[0].content).toMatch(/reply in Korean, the guest's language/);
	expect(messages[0].content).toMatch(/same reply in Vietnamese/);
	expect(messages[0].content).toMatch(/Never state a price/);
	expect(messages[1].content).toContain("nationality: Korean");
	expect(messages[1].content).toContain('<agent at="2026-09-18T00:01:00.000Z">');
	expect(messages[1].content).toContain("금요일?");
});

test("every failure is null so the fallback stands; a filtered or empty answer is not asked again", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const layer = layerFor({ DRAFT_API_KEY: "sk-test" });
	const request = { officeId: "office-a", text: "hello", from: "en", to: "vi" } as const;

	// Failures the provider may get past: tried once more, then the fallback.
	for (const respond of [
		() => new Response("rate limited", { status: 429 }),
		() => new Response("bad gateway", { status: 502 }),
		() => new Response("{ not json", { status: 200 }),
		// A body that isn't JSON: the parser's error quotes its start, here the guest's words (#220).
		() => new Response("hello, but not JSON", { status: 200 }),
		() => {
			throw new TypeError("fetch failed: hello");
		},
	]) {
		const calls = stubFetch(respond);
		expect(await layer.translate(request)).toBeNull();
		expect(calls).toHaveLength(2);
	}

	// Refusals that would fail again (a bad key, no balance, an unknown model, a shape this
	// client can't read): the fallback at once, with no second call spent on the cap.
	for (const respond of [
		() => new Response("unauthorized", { status: 401 }),
		() => new Response("payment required", { status: 402 }),
		() => new Response("no such model", { status: 404 }),
		() => Response.json({ choices: [] }),
	]) {
		const calls = stubFetch(respond);
		expect(await layer.translate(request)).toBeNull();
		expect(calls).toHaveLength(1);
	}

	// Answers: nothing to show, and nothing to retry.
	for (const respond of [
		() => completion(null),
		() => completion("   "),
		() => completion("blocked", "content_filter"),
	]) {
		const calls = stubFetch(respond);
		expect(await layer.translate(request)).toBeNull();
		expect(calls).toHaveLength(1);
	}

	// Guest text never reaches the log; the error's kind does.
	for (const call of warn.mock.calls) {
		expect(JSON.stringify(call)).not.toContain("hello");
	}
	expect(warn).toHaveBeenCalledWith(
		"model call",
		expect.objectContaining({ outcome: "error", kind: "SyntaxError" }),
	);
	expect(warn).toHaveBeenCalledWith(
		"model call",
		expect.objectContaining({ outcome: "filtered", inputTokens: 120, outputTokens: 30 }),
	);
});

test("a base URL without a trailing slash is joined the same way", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const calls = stubFetch(() => completion("ok"));
	const local = layerFor({ DRAFT_API_KEY: "ollama", DRAFT_BASE_URL: "http://localhost:11434/v1" });
	await local.translate({ officeId: "office-a", text: "hi", from: "en", to: "vi" });
	expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
});
