import { z } from "zod";

import type { DraftAdapter } from "./adapter";
import {
	followUpSystemPrompt,
	followUpUserPrompt,
	translationSystemPrompt,
	translationUserPrompt,
} from "./prompts";

/**
 * One implementation for every provider that speaks the OpenAI chat-completions protocol:
 * OpenRouter (the default base URL, and itself a door to every vendor), Groq, DeepSeek,
 * Gemini, OpenAI, Mistral, a local Ollama. Provider and model are configuration, not code
 * (ADR 0005: one seam, no vendor in the domain). No SDK: the protocol is a POST with three
 * fields, and a hand-written client cannot drift with a vendor's package.
 *
 * Both calls are short, one-turn completions, so `max_tokens` is deliberately small: a
 * translation of a chat message or a three-sentence reply never needs more. Any failure
 * returns `null` and the fallback stands; the operator never waits on the model.
 */
const TRANSLATION_MAX_TOKENS = 1024;
const FOLLOW_UP_MAX_TOKENS = 512;
const REQUEST_TIMEOUT_MS = 30_000;

/** The slice of a chat-completions response this adapter reads. Everything else is ignored. */
const completion = z.object({
	choices: z
		.array(
			z.object({
				message: z.object({ content: z.string().nullable() }),
				finish_reason: z.string().nullable().optional(),
			}),
		)
		.min(1),
});

export function createOpenAiCompatibleDraftAdapter(input: {
	apiKey: string;
	baseUrl: string;
	model: string;
}): DraftAdapter {
	const endpoint = `${input.baseUrl.replace(/\/+$/, "")}/chat/completions`;

	// Guest text never reaches the log; only what the endpoint said about the request.
	function warn(detail: Record<string, unknown>): null {
		console.warn("inbox draft adapter: request failed", { model: input.model, ...detail });
		return null;
	}

	async function complete(system: string, user: string, maxTokens: number): Promise<string | null> {
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${input.apiKey}`,
				},
				body: JSON.stringify({
					model: input.model,
					max_tokens: maxTokens,
					temperature: 0.2,
					messages: [
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
				}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (!response.ok) {
				return warn({ status: response.status });
			}
			const parsed = completion.safeParse(await response.json());
			if (!parsed.success) {
				return warn({ status: response.status, reason: "unexpected response shape" });
			}
			const [choice] = parsed.data.choices;
			if (choice.finish_reason === "content_filter") {
				return null;
			}
			const text = choice.message.content?.trim();
			return text || null;
		} catch (error) {
			return warn({ reason: error instanceof Error ? error.message : String(error) });
		}
	}

	return {
		provider: "openai-compatible",
		translate: (request) =>
			complete(
				translationSystemPrompt(request.to),
				translationUserPrompt(request),
				TRANSLATION_MAX_TOKENS,
			),
		followUp: (request) =>
			complete(
				followUpSystemPrompt(request.guestLanguage),
				followUpUserPrompt(request),
				FOLLOW_UP_MAX_TOKENS,
			),
	};
}
