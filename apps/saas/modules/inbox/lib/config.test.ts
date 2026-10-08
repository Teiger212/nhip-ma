import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";
import { expect, test } from "vitest";
import { generateVAPIDKeys } from "web-push";

import {
	DEFAULT_DRAFT_BASE_URL,
	inboxConfigFromEnv,
	mockInboxConfig,
	validateInboxEnv,
} from "./config";
import { draftAdapterFromConfig } from "./drafts";
import { RETIRED_E2E_VAPID_PUBLIC_KEY } from "./retired-vapid-key";

const BASE: NodeJS.ProcessEnv = {
	NODE_ENV: "test",
	NEXT_PUBLIC_SAAS_URL: "http://localhost:3010",
	BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-for-validation!",
};

function errorsOf(env: NodeJS.ProcessEnv): string[] {
	const result = validateInboxEnv(env);
	return result.ok ? [] : result.errors;
}

/** The model layer's cap counter, never reached by these tests. */
const claim = async () => true;

function configOf(env: NodeJS.ProcessEnv) {
	const result = validateInboxEnv(env);
	if (!result.ok) throw new Error(result.errors.join("\n"));
	return result.config;
}

// ADR 0024: a model per task, defaulted in code; an env var overrides either; a key alone starts it.
test("a key alone is enough: both tasks get their default model and cap", () => {
	expect(errorsOf({ ...BASE, DRAFT_API_KEY: "sk" })).toEqual([]);
	const config = configOf({ ...BASE, DRAFT_API_KEY: "sk" });
	expect(config.models).toEqual({
		apiKey: "sk",
		baseUrl: DEFAULT_DRAFT_BASE_URL,
		draft: { model: "anthropic/claude-haiku-5.5", dailyCap: 50 },
		translate: { model: "anthropic/claude-haiku-5.5", dailyCap: 1000 },
		stub: [],
	});
	const layer = draftAdapterFromConfig(config, { claim });
	expect(layer.serves("draft")).toBe(true);
	expect(layer.serves("translate")).toBe(true);
});

test("each task's model and cap is overridden by its own env var", () => {
	const config = configOf({
		...BASE,
		DRAFT_API_KEY: "sk",
		DRAFT_MODEL: " vendor/drafter ",
		TRANSLATE_MODEL: "google/gemini-3.1-flash-lite",
		DRAFT_DAILY_CAP: "20",
		TRANSLATE_DAILY_CAP: "0",
	});
	expect(config.models.draft).toEqual({ model: "vendor/drafter", dailyCap: 20 });
	expect(config.models.translate).toEqual({ model: "google/gemini-3.1-flash-lite", dailyCap: 0 });
	expect(errorsOf({ ...BASE, DRAFT_DAILY_CAP: "fifty", TRANSLATE_DAILY_CAP: "-1" })).toEqual([
		'DRAFT_DAILY_CAP must be a whole number of model calls a day, got "fifty"',
		'TRANSLATE_DAILY_CAP must be a whole number of model calls a day, got "-1"',
	]);
	// More than the counter can hold would make every claim fail, and so turn the task off.
	expect(errorsOf({ ...BASE, DRAFT_DAILY_CAP: "9999999999" })).toEqual([
		'DRAFT_DAILY_CAP must be a whole number of model calls a day, got "9999999999"',
	]);
});

test("no key means no model, whatever else is set", () => {
	const config = configOf({ ...BASE, DRAFT_MODEL: "vendor/model", TRANSLATE_MODEL: "vendor/t" });
	const layer = draftAdapterFromConfig(config, { claim });
	expect(layer.serves("draft")).toBe(false);
	expect(layer.serves("translate")).toBe(false);
	expect(draftAdapterFromConfig(mockInboxConfig(), { claim }).serves("translate")).toBe(false);
});

test("the base URL may be any absolute http(s) endpoint in development, trimmed", () => {
	expect(errorsOf({ ...BASE, DRAFT_BASE_URL: "openrouter.ai" })).toEqual([
		'DRAFT_BASE_URL must be an absolute http(s) URL, got "openrouter.ai"',
	]);
	const config = configOf({
		...BASE,
		DRAFT_API_KEY: "ollama",
		DRAFT_BASE_URL: " http://localhost:11434/v1 ",
	});
	expect(config.models.baseUrl).toBe("http://localhost:11434/v1");
});

// ADR 0024: OpenRouter with zero-retention routing is the only production provider.
test("production calls OpenRouter only", () => {
	const production = { ...BASE, VERCEL_ENV: "production", DRAFT_API_KEY: "sk" };
	expect(errorsOf({ ...production, DRAFT_BASE_URL: "https://api.openai.com/v1" })).toEqual([
		`DRAFT_BASE_URL must be OpenRouter (${DEFAULT_DRAFT_BASE_URL}) in production`,
	]);
	// The key is a bearer token: never over plain http.
	expect(errorsOf({ ...production, DRAFT_BASE_URL: "http://openrouter.ai/api/v1" })).toEqual([
		`DRAFT_BASE_URL must be OpenRouter (${DEFAULT_DRAFT_BASE_URL}) in production`,
	]);
	expect(errorsOf({ ...production, DRAFT_BASE_URL: "https://openrouter.ai/api/v1" })).toEqual([]);
	expect(errorsOf(production)).toEqual([]);
	expect(
		errorsOf({ ...BASE, VERCEL_ENV: "preview", DRAFT_BASE_URL: "http://localhost:1/v1" }),
	).toEqual([]);
});

// ADR 0024: E2E runs against a deterministic stub, refused in production as the mock CRM's secret is.
test("the stub model answers the tasks MODEL_STUB names, needs no key, and production refuses it", () => {
	const config = configOf({ ...BASE, MODEL_STUB: "translate" });
	expect(config.models.stub).toEqual(["translate"]);
	const layer = draftAdapterFromConfig(config, { claim });
	expect(layer.serves("translate")).toBe(true);
	expect(layer.serves("draft")).toBe(false);
	expect(configOf({ ...BASE, MODEL_STUB: "draft, translate" }).models.stub).toEqual([
		"draft",
		"translate",
	]);

	expect(errorsOf({ ...BASE, MODEL_STUB: "translate", VERCEL_ENV: "production" })).toEqual([
		"MODEL_STUB must not be set in production: the stub model's fixed text is for E2E",
	]);
	expect(errorsOf({ ...BASE, MODEL_STUB: "translate,greet" })).toEqual([
		'MODEL_STUB lists the tasks the stub model answers (draft, translate), got "greet"',
	]);
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

// #222: the E2E build sends no email and polls the Inbox every second; only the E2E run may be it.
test("production, staging and live deployments refuse the E2E flag; the E2E run starts with it", () => {
	const deployed = { ...PROD, NEXT_PUBLIC_SAAS_URL: "https://nhip.example" };
	const deployments: Record<string, string>[] = [
		{ VERCEL_ENV: "production" },
		{ VERCEL_ENV: "preview" },
		{ SEND_MODE: "live" },
	];
	for (const where of deployments) {
		for (const value of ["1", "true"]) {
			expect(
				errorsOf({ ...deployed, E2E: value, ...where }).join("\n"),
				JSON.stringify(where),
			).toContain("E2E must not be set");
		}
		expect(errorsOf({ ...deployed, ...where }), JSON.stringify(where)).toEqual([]);
	}
	// The E2E run: a production build on the runner, mock sends, no Vercel.
	expect(
		errorsOf({
			...PROD,
			E2E: "1",
			SEND_MODE: "mock",
			NEXT_PUBLIC_SAAS_URL: "https://localhost:3443",
		}),
	).toEqual([]);
});

// #66: HubSpot's webhook is verified with the app's client secret over the URL HubSpot calls;
// one without the other cannot verify anything, and the URL is the https one HubSpot is given.
test("HubSpot's webhook settings are set together, its URL an https one", () => {
	const secret = { HUBSPOT_APP_CLIENT_SECRET: "client-secret" };
	const url = { HUBSPOT_WEBHOOK_URL: "https://nhip.example/webhooks/crm/hubspot" };
	expect(errorsOf({ ...BASE, ...secret }).join("\n")).toContain("HUBSPOT_WEBHOOK_URL");
	expect(errorsOf({ ...BASE, ...url }).join("\n")).toContain("HUBSPOT_APP_CLIENT_SECRET");
	expect(
		errorsOf({
			...BASE,
			...secret,
			HUBSPOT_WEBHOOK_URL: "http://localhost:3010/webhooks/crm/hubspot",
		}),
	).toHaveLength(1);
	expect(errorsOf({ ...BASE, ...secret, ...url })).toEqual([]);
	expect(errorsOf(BASE)).toEqual([]);
});

// #134: the VAPID keys are read as a set. None set is fine (alerts are logged, not pushed); a
// partial set is a mistake to refuse, and the subject is the address push services write to.
test("VAPID keys are read as a set: all three, or none", () => {
	const vapid = {
		VAPID_PUBLIC_KEY: "BPub-vitest",
		VAPID_PRIVATE_KEY: "priv-vitest",
		VAPID_SUBJECT: "mailto:alerts@nhip.local",
	};
	const ok = validateInboxEnv({ ...BASE, ...vapid });
	expect(ok.ok && ok.config.vapid).toEqual({
		publicKey: "BPub-vitest",
		privateKey: "priv-vitest",
		subject: "mailto:alerts@nhip.local",
	});
	const none = validateInboxEnv(BASE);
	expect(none.ok && none.config.vapid).toBeNull();
	expect(errorsOf({ ...BASE, VAPID_PUBLIC_KEY: vapid.VAPID_PUBLIC_KEY }).join("\n")).toContain(
		"VAPID_PRIVATE_KEY",
	);
	expect(errorsOf({ ...BASE, ...vapid, VAPID_SUBJECT: "alerts@nhip.local" }).join("\n")).toContain(
		"VAPID_SUBJECT",
	);
	expect(errorsOf({ ...BASE, ...vapid, VAPID_SUBJECT: "https://nhip.vn" })).toEqual([]);
});

// #135: the E2E pair once sat in the public repo. Production and staging (Vercel's Preview) and
// any live deployment refuse it at startup; a fresh pair made for an E2E run is fine.
test("production, staging and live deployments refuse the retired E2E VAPID key", () => {
	const retired = {
		VAPID_PUBLIC_KEY: RETIRED_E2E_VAPID_PUBLIC_KEY,
		VAPID_PRIVATE_KEY: "whatever-was-paired-with-it",
		VAPID_SUBJECT: "mailto:alerts@nhip.vn",
	};
	for (const where of <NodeJS.ProcessEnv[]>[
		{ VERCEL_ENV: "production" },
		{ VERCEL_ENV: "preview" },
		{ SEND_MODE: "live" },
		// A self-hosted production build, whatever its send mode.
		{ NODE_ENV: "production", NEXT_PUBLIC_SAAS_URL: "https://nhip.example" },
	]) {
		const errors = errorsOf({ ...BASE, ...retired, ...where }).join("\n");
		expect(errors, JSON.stringify(where)).toContain("VAPID_PUBLIC_KEY");
		// The refusal names the key, never its value.
		expect(errors).not.toContain(RETIRED_E2E_VAPID_PUBLIC_KEY);
	}
	// A developer's machine starts with it, but it counts as no keys: nothing is pushed with it,
	// and the page is handed no key to subscribe with.
	const dev = validateInboxEnv({ ...BASE, ...retired });
	expect(dev.ok && dev.config.vapid).toBeNull();
	expect(inboxConfigFromEnv({ ...BASE, ...retired, SEND_MODE: "live" }).vapid).toBeNull();
	// And production starts with a pair of its own.
	const fresh = generateVAPIDKeys();
	expect(
		errorsOf({
			...BASE,
			...retired,
			VAPID_PUBLIC_KEY: fresh.publicKey,
			VAPID_PRIVATE_KEY: fresh.privateKey,
			VAPID_SUBJECT: "mailto:alerts@nhip.vn",
			VERCEL_ENV: "production",
		}),
	).toEqual([]);
});

test("the committed E2E profile carries no VAPID key pair (#135)", () => {
	const profile = parse(readFileSync(resolve(__dirname, "../../../../../.env.e2e")));
	expect(profile.VAPID_PUBLIC_KEY).toBeUndefined();
	expect(profile.VAPID_PRIVATE_KEY).toBeUndefined();
	expect(profile.VAPID_SUBJECT).toBeTruthy();
});
