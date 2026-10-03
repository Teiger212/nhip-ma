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

/** A production-shaped env that passes except for the URL under test. */
const PROD = {
	...BASE,
	NODE_ENV: "production",
	BETTER_AUTH_SECRET: "e2e-only-not-a-secret-0123456789abcdef-nhip",
} as unknown as NodeJS.ProcessEnv;

const urlErrors = (env: NodeJS.ProcessEnv) => {
	const result = validateInboxEnv(env);
	return result.ok ? [] : result.errors.filter((error) => error.includes("NEXT_PUBLIC_SAAS_URL"));
};

test("production still requires https, including on localhost without the E2E flag", () => {
	expect(urlErrors({ ...PROD, NEXT_PUBLIC_SAAS_URL: "http://localhost:3000" })).toHaveLength(1);
	expect(urlErrors({ ...PROD, NEXT_PUBLIC_SAAS_URL: "https://app.nhip.vn" })).toHaveLength(0);
});

test("production requires https everywhere, the E2E run included (no localhost exception)", () => {
	for (const url of ["http://localhost:3000", "http://127.0.0.1:3000", "http://staging.nhip.vn"]) {
		expect(urlErrors({ ...PROD, E2E: "1", NEXT_PUBLIC_SAAS_URL: url }), url).toHaveLength(1);
	}
	expect(
		urlErrors({ ...PROD, E2E: "1", NEXT_PUBLIC_SAAS_URL: "https://localhost:3443" }),
	).toHaveLength(0);
});

// ADR 0003 amendment (2026-10-03): production stays on no mock CRM notices; spec #59 (#63) "unreachable in production".
test("a production deployment refuses the mock CRM's webhook secret, whatever its value", () => {
	const mock = { ...BASE, MOCK_CRM_WEBHOOK_SECRET: "any-value-at-all" };
	expect(errorsOf({ ...mock, VERCEL_ENV: "production" }).join("\n")).toContain(
		"MOCK_CRM_WEBHOOK_SECRET",
	);
	expect(errorsOf({ ...mock, VERCEL_ENV: "preview" })).toEqual([]);
	expect(errorsOf(mock)).toEqual([]);
});
