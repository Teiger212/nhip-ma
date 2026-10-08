import { STUB_MODEL } from "../lib/drafts/stub";

/**
 * What an eval call costs (#254). Prices are OpenRouter's list prices in USD per million
 * tokens, as ADR 0024 records them and `openrouter.ai/api/v1/models` listed them on 2026-10-08.
 * A Gemini 3.x model bills its thinking as output; `completion_tokens` includes it.
 */
export const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
	"anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
	"google/gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
	[STUB_MODEL]: { input: 0, output: 0 },
};

/** USD for one call, or null for a model with no price on file. */
export function costOf(model: string, inputTokens: number, outputTokens: number): number | null {
	const price = PRICES_PER_MILLION[model];
	if (!price) return null;
	return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * A deliberately high token count for `text`, for the estimate printed before a paid run: four
 * ASCII characters a token, and every other character (CJK, Cyrillic, Vietnamese letters) a token
 * of its own.
 */
export function estimateTokens(text: string): number {
	let ascii = 0;
	let other = 0;
	for (const char of text) {
		if (char.charCodeAt(0) < 128) ascii += 1;
		else other += 1;
	}
	return Math.ceil(ascii / 4) + other;
}

/** Output a Gemini 3.x model may spend thinking at its lowest level: a margin on the estimate. */
export const THINKING_MARGIN_TOKENS = 200;

export function thinksAsOutput(model: string): boolean {
	return /^google\/gemini-3/u.test(model);
}

export function formatUsd(value: number | null): string {
	if (value === null) return "n/a";
	if (value === 0) return "$0";
	return value < 0.01 ? `$${value.toFixed(5)}` : `$${value.toFixed(4)}`;
}
