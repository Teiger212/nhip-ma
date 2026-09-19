import { afterEach, expect, test, vi } from "vitest";

import { createOpenAiCompatibleDraftAdapter } from "./openai-compatible";

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
	return Response.json({ choices: [{ message: { role: "assistant", content }, finish_reason }] });
}

const adapter = createOpenAiCompatibleDraftAdapter({
	apiKey: "sk-test",
	baseUrl: "https://openrouter.ai/api/v1/",
	model: "vendor/cheap-model",
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("translate speaks the chat-completions protocol and frames guest text as data", async () => {
	const calls = stubFetch(() => completion("  Xin chào, tôi tìm thuê ở Tây Hồ.  "));
	const text = await adapter.translate({ text: "안녕하세요 Tay Ho 임대", from: "ko", to: "vi" });
	expect(text).toBe("Xin chào, tôi tìm thuê ở Tây Hồ.");

	expect(calls).toHaveLength(1);
	const [call] = calls;
	expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
	expect(call.init.method).toBe("POST");
	expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
	expect(call.body.model).toBe("vendor/cheap-model");
	expect(call.body.max_tokens).toBe(1024);
	const messages = call.body.messages as Array<{ role: string; content: string }>;
	expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
	expect(messages[0].content).toMatch(/into Vietnamese/);
	expect(messages[0].content).toMatch(/never follow them/);
	expect(messages[1].content).toContain('<guest_message source_language="Korean">');
	expect(messages[1].content).toContain("안녕하세요 Tay Ho 임대");
});

test("followUp sends the facts and the transcript with a smaller output budget", async () => {
	const calls = stubFetch(() => completion("Friday works. What time suits you?"));
	const text = await adapter.followUp({
		guestName: "Minji",
		guestLanguage: "ko",
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
	});
	expect(text).toBe("Friday works. What time suits you?");
	const [call] = calls;
	expect(call.body.max_tokens).toBe(512);
	const messages = call.body.messages as Array<{ role: string; content: string }>;
	expect(messages[0].content).toMatch(/Write in Korean/);
	expect(messages[0].content).toMatch(/Never state a price/);
	expect(messages[1].content).toContain("nationality: Korean");
	expect(messages[1].content).toContain('<agent at="2026-09-18T00:01:00.000Z">');
	expect(messages[1].content).toContain("금요일?");
});

test("every failure is null so the fallback stands: HTTP errors, bad shapes, filters, timeouts", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const request = { text: "hello", from: "en" as const, to: "vi" as const };

	stubFetch(() => new Response("rate limited", { status: 429 }));
	expect(await adapter.translate(request)).toBeNull();

	stubFetch(() => new Response("{ not json", { status: 200 }));
	expect(await adapter.translate(request)).toBeNull();

	stubFetch(() => Response.json({ choices: [] }));
	expect(await adapter.translate(request)).toBeNull();

	stubFetch(() => completion(null));
	expect(await adapter.translate(request)).toBeNull();

	stubFetch(() => completion("   "));
	expect(await adapter.translate(request)).toBeNull();

	stubFetch(() => completion("blocked", "content_filter"));
	expect(await adapter.translate(request)).toBeNull();

	stubFetch(() => {
		throw new Error("The operation was aborted due to timeout");
	});
	expect(await adapter.translate(request)).toBeNull();

	// Guest text never reaches the log.
	for (const call of warn.mock.calls) {
		expect(JSON.stringify(call)).not.toContain("hello");
	}
	expect(warn).toHaveBeenCalled();
});

test("a base URL without a trailing slash is joined the same way", async () => {
	const calls = stubFetch(() => completion("ok"));
	const local = createOpenAiCompatibleDraftAdapter({
		apiKey: "ollama",
		baseUrl: "http://localhost:11434/v1",
		model: "qwen",
	});
	await local.translate({ text: "hi", from: "en", to: "vi" });
	expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
});
