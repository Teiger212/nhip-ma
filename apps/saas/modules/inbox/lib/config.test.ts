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
