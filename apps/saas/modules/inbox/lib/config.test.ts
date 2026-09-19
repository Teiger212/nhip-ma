import { expect, test } from "vitest";

import { DEFAULT_DRAFT_BASE_URL, mockInboxConfig, validateInboxEnv } from "./config";
import { draftAdapterFromConfig } from "./drafts";

const BASE: NodeJS.ProcessEnv = {
	NODE_ENV: "test",
	NEXT_PUBLIC_SAAS_URL: "http://localhost:3010",
	BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-for-validation!",
};

function errorsOf(env: NodeJS.ProcessEnv): string[] {
	const result = validateInboxEnv(env);
	return result.ok ? [] : result.errors;
}

test("no draft key means no model, whatever else is set", () => {
	const result = validateInboxEnv({ ...BASE, DRAFT_MODEL: "vendor/model" });
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.config.drafts).toEqual({ baseUrl: DEFAULT_DRAFT_BASE_URL, model: "vendor/model" });
	expect(draftAdapterFromConfig(result.config).provider).toBe("none");
});

test("a draft key needs a model id: there is no default that can go stale", () => {
	expect(errorsOf({ ...BASE, DRAFT_API_KEY: "sk" })).toEqual([
		"DRAFT_MODEL must be set when DRAFT_API_KEY is set",
	]);
	const result = validateInboxEnv({ ...BASE, DRAFT_API_KEY: "sk", DRAFT_MODEL: "vendor/model" });
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.config.drafts).toEqual({
		apiKey: "sk",
		baseUrl: DEFAULT_DRAFT_BASE_URL,
		model: "vendor/model",
	});
	expect(draftAdapterFromConfig(result.config).provider).toBe("openai-compatible");
});

test("the base URL is any absolute http(s) endpoint, trimmed", () => {
	expect(errorsOf({ ...BASE, DRAFT_BASE_URL: "openrouter.ai" })).toEqual([
		'DRAFT_BASE_URL must be an absolute http(s) URL, got "openrouter.ai"',
	]);
	const result = validateInboxEnv({
		...BASE,
		DRAFT_API_KEY: "ollama",
		DRAFT_MODEL: "qwen",
		DRAFT_BASE_URL: " http://localhost:11434/v1 ",
	});
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.config.drafts.baseUrl).toBe("http://localhost:11434/v1");
});

test("the test config has no model behind it", () => {
	expect(draftAdapterFromConfig(mockInboxConfig()).provider).toBe("none");
});
