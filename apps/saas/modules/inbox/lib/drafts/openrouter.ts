import { z } from "zod";

import type { DraftInput, TranslateInput } from "./adapter";
import type { Attempt, TaskBackend } from "./layer";
import {
	followUpSystemPrompt,
	followUpUserPrompt,
	translationSystemPrompt,
	translationUserPrompt,
} from "./prompts";

/**
 * OpenRouter, the only production provider (ADR 0024), over its OpenAI-compatible
 * chat-completions protocol. The base URL may point elsewhere in development; a production
 * deployment refuses anything but OpenRouter (`config.ts`). No SDK: the protocol is one POST,
 * and a hand-written client cannot drift with a vendor's package.
 *
 * Every request asks for zero-retention endpoints that never train on the text
 * (openrouter.ai/docs/guides/features/zdr): guests' words aren't kept by the model's provider.
 *
 * Both tasks are short, one-turn completions, so `max_tokens` is deliberately small: a
 * translation of a chat message, or a reply of up to four sentences in two languages, never
 * needs more. A model's reasoning counts against `max_tokens` too
 * (openrouter.ai/docs/guides/best-practices/reasoning-tokens: the page's opening, and "Reasoning
 * tokens and max_tokens"): at 768, two drafts of the first eval used the whole budget and the
 * JSON never closed (#289). A draft reasons, so its budget leaves room for the reasoning and the
 * JSON both: for Anthropic models the reasoning budget is at least 1,024 tokens and `max_tokens`
 * must be strictly above it ("Anthropic Models with Reasoning Tokens"). A cut-off answer isn't
 * the JSON, so the template stands.
 */
const TRANSLATION_MAX_TOKENS = 1024;
const DRAFT_MAX_TOKENS = 2000;

/** OpenRouter's provider routing: zero-retention endpoints only, and no training on the text. */
export const ZERO_RETENTION = { zdr: true, data_collection: "deny" } as const;

type Reasoning =
	| { effort: "minimal"; exclude: true }
	| { effort: "medium"; exclude: true }
	| { enabled: false };

/**
 * The `reasoning` a task's request carries (#289, decided by Eyal 2026-10-09). Reasoning bills as
 * output and counts against `max_tokens`.
 * - Gemini 3.x thinks at its lowest level for both tasks (ADR 0024).
 * - An Anthropic model drafts at medium effort, its own default, which kept the first eval's
 *   drafts to the rules; it translates with reasoning off, which a translation doesn't need.
 *   `enabled: false` is OpenRouter's switch for Anthropic's `thinking: { type: "disabled" }`
 *   ("Reasoning with the Anthropic Messages API"); Claude rejects `effort: "none"` ("Changing
 *   Effort Mid-Conversation"). The reasoning is kept out of the answer (`exclude`).
 * - Any other model's request carries no `reasoning`.
 */
export function reasoningFor(model: string, task: "draft" | "translate"): Reasoning | undefined {
	if (/^google\/gemini-3/u.test(model)) return { effort: "minimal", exclude: true };
	if (/^anthropic\//u.test(model)) {
		return task === "draft" ? { effort: "medium", exclude: true } : { enabled: false };
	}
	return undefined;
}

/** The slice of a chat-completions response this client reads. Everything else is ignored. */
const completion = z.object({
	choices: z
		.array(
			z.object({
				message: z.object({ content: z.string().nullable() }),
				finish_reason: z.string().nullable().optional(),
			}),
		)
		.min(1),
	usage: z
		.object({
			prompt_tokens: z.number().optional(),
			completion_tokens: z.number().optional(),
		})
		.nullish(),
});

type Prompt = { task: "draft" | "translate"; system: string; user: string; maxTokens: number };

export function createOpenRouterBackends(input: {
	apiKey: string;
	baseUrl: string;
	models: { draft: string; translate: string };
}): { draft: TaskBackend<DraftInput>; translate: TaskBackend<TranslateInput> } {
	const endpoint = `${input.baseUrl.replace(/\/+$/, "")}/chat/completions`;

	async function complete(model: string, prompt: Prompt, signal: AbortSignal): Promise<Attempt> {
		const reasoning = reasoningFor(model, prompt.task);
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${input.apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: prompt.maxTokens,
				temperature: 0.2,
				provider: ZERO_RETENTION,
				...(reasoning ? { reasoning } : {}),
				messages: [
					{ role: "system", content: prompt.system },
					{ role: "user", content: prompt.user },
				],
			}),
			signal,
		});
		if (!response.ok) {
			return { outcome: "error", status: response.status };
		}
		// A body that isn't JSON throws a SyntaxError quoting its start, which can be the guest's
		// words: the layer logs its kind only (#220).
		const parsed = completion.safeParse(await response.json());
		if (!parsed.success) {
			return { outcome: "error", status: response.status, kind: "unexpected response shape" };
		}
		const [choice] = parsed.data.choices;
		const tokens = {
			inputTokens: parsed.data.usage?.prompt_tokens ?? null,
			outputTokens: parsed.data.usage?.completion_tokens ?? null,
		};
		if (choice.finish_reason === "content_filter") {
			return { outcome: "filtered", ...tokens };
		}
		const text = choice.message.content?.trim();
		return text ? { outcome: "ok", text, ...tokens } : { outcome: "empty", ...tokens };
	}

	return {
		translate: {
			model: input.models.translate,
			run: (request, signal) =>
				complete(
					input.models.translate,
					{
						task: "translate",
						system: translationSystemPrompt(request.to),
						user: translationUserPrompt(request),
						maxTokens: TRANSLATION_MAX_TOKENS,
					},
					signal,
				),
		},
		draft: {
			model: input.models.draft,
			run: (request, signal) =>
				complete(
					input.models.draft,
					{
						task: "draft",
						system: followUpSystemPrompt(request.guestLanguage, request.officeLanguage),
						user: followUpUserPrompt(request),
						maxTokens: DRAFT_MAX_TOKENS,
					},
					signal,
				),
		},
	};
}
