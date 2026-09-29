import { describe, expect, it } from "vitest";

import { EXAMPLE_BETTER_AUTH_SECRET, validateInboxEnv } from "./env";

const VALID_SECRET = "a".repeat(32);

function baseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
	return {
		BETTER_AUTH_SECRET: VALID_SECRET,
		NEXT_PUBLIC_SAAS_URL: "http://localhost:3010",
		...overrides,
	} as NodeJS.ProcessEnv;
}

describe("auth base URL rules", () => {
	it("requires NEXT_PUBLIC_SAAS_URL", () => {
		const result = validateInboxEnv(baseEnv({ NEXT_PUBLIC_SAAS_URL: undefined }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/NEXT_PUBLIC_SAAS_URL is required/);
	});

	it("rejects a relative or non-http base URL", () => {
		const result = validateInboxEnv(baseEnv({ NEXT_PUBLIC_SAAS_URL: "localhost:3010" }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/absolute http\(s\) URL/);
	});

	it("requires https in production", () => {
		const result = validateInboxEnv(
			baseEnv({ NODE_ENV: "production", NEXT_PUBLIC_SAAS_URL: "http://nhip.example" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.errors).toContainEqual(expect.stringMatching(/https in production/));
	});

	it("rejects a BETTER_AUTH_URL that disagrees with NEXT_PUBLIC_SAAS_URL", () => {
		const agree = validateInboxEnv(baseEnv({ BETTER_AUTH_URL: "http://localhost:3010/" }));
		expect(agree.ok).toBe(true);
		const disagree = validateInboxEnv(baseEnv({ BETTER_AUTH_URL: "http://localhost:3000" }));
		expect(disagree.ok).toBe(false);
		if (!disagree.ok) expect(disagree.errors[0]).toMatch(/differs from NEXT_PUBLIC_SAAS_URL/);
	});

	it("refuses AUTH_TRUSTED_ORIGINS in production", () => {
		const result = validateInboxEnv(
			baseEnv({
				NODE_ENV: "production",
				NEXT_PUBLIC_SAAS_URL: "https://nhip.example",
				AUTH_TRUSTED_ORIGINS: "https://*.trycloudflare.com",
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.errors).toContainEqual(expect.stringMatching(/AUTH_TRUSTED_ORIGINS/));
	});
});

describe("validateInboxEnv", () => {
	it("passes for a minimal valid env", () => {
		expect(validateInboxEnv(baseEnv())).toMatchObject({ ok: true });
	});

	it("accepts SEND_MODE left unset", () => {
		expect(validateInboxEnv(baseEnv({ SEND_MODE: undefined }))).toMatchObject({ ok: true });
	});

	it("accepts SEND_MODE=mock", () => {
		expect(validateInboxEnv(baseEnv({ SEND_MODE: "mock" }))).toMatchObject({ ok: true });
	});

	it("rejects an invalid SEND_MODE value", () => {
		const result = validateInboxEnv(baseEnv({ SEND_MODE: "prod" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([`SEND_MODE must be "mock" or "live" when set, got "prod"`]);
		}
	});

	it("a live deployment needs no pipe configured: an unconfigured pipe just never sends live", () => {
		expect(validateInboxEnv(baseEnv({ SEND_MODE: "live" }))).toMatchObject({ ok: true });
	});

	it("a pipe is configured whole or not at all", () => {
		const result = validateInboxEnv(
			baseEnv({ SEND_MODE: "live", ZALO_APP_ID: "app", WHATSAPP_ACCESS_TOKEN: "token" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([
				"WHATSAPP_APP_SECRET must be set: whatsapp is configured only in part (WHATSAPP_ACCESS_TOKEN set)",
				"WHATSAPP_PHONE_NUMBER_ID must be set: whatsapp is configured only in part (WHATSAPP_ACCESS_TOKEN set)",
				"ZALO_APP_SECRET must be set: zalo is configured only in part (ZALO_APP_ID set)",
				"ZALO_OA_SECRET_KEY must be set: zalo is configured only in part (ZALO_APP_ID set)",
				"PIPE_SECRETS_KEY must be set: zalo is configured only in part (ZALO_APP_ID set)",
			]);
		}
	});

	it("treats a blank setting the same as a missing one, and checks the secrets key", () => {
		const result = validateInboxEnv(
			baseEnv({
				ZALO_APP_ID: "app",
				ZALO_APP_SECRET: "   ",
				ZALO_OA_SECRET_KEY: "oa",
				PIPE_SECRETS_KEY: "too-short",
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([
				"ZALO_APP_SECRET must be set: zalo is configured only in part (ZALO_APP_ID, ZALO_OA_SECRET_KEY, PIPE_SECRETS_KEY set)",
				"PIPE_SECRETS_KEY must be 32 random bytes, base64-encoded",
			]);
		}
	});

	it("passes with every pipe configured whole", () => {
		const key = Buffer.alloc(32, 1).toString("base64");
		expect(
			validateInboxEnv(
				baseEnv({
					SEND_MODE: "live",
					WHATSAPP_APP_SECRET: "secret",
					WHATSAPP_ACCESS_TOKEN: "token",
					WHATSAPP_PHONE_NUMBER_ID: "id",
					ZALO_APP_ID: "app",
					ZALO_APP_SECRET: "app-secret",
					ZALO_OA_SECRET_KEY: "oa-secret",
					PIPE_SECRETS_KEY: key,
				}),
			),
		).toMatchObject({
			ok: true,
			config: {
				sendMode: "live",
				whatsapp: { appSecret: "secret", accessToken: "token", phoneNumberId: "id" },
				zalo: { appId: "app", appSecret: "app-secret", oaSecretKey: "oa-secret" },
				pipeSecretsKey: key,
			},
		});
	});

	it("requires BETTER_AUTH_SECRET", () => {
		const result = validateInboxEnv(baseEnv({ BETTER_AUTH_SECRET: undefined }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual(["BETTER_AUTH_SECRET is required"]);
		}
	});

	it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", () => {
		const result = validateInboxEnv(baseEnv({ BETTER_AUTH_SECRET: "too-short" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual(["BETTER_AUTH_SECRET must be at least 32 characters"]);
		}
	});

	it("rejects the .env.local.example placeholder secret", () => {
		const result = validateInboxEnv(baseEnv({ BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([
				"BETTER_AUTH_SECRET must not be the .env.local.example placeholder value",
			]);
		}
	});

	it("collects every violated rule at once", () => {
		const result = validateInboxEnv({
			SEND_MODE: "prod",
			BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET,
			NODE_ENV: "production",
		} as NodeJS.ProcessEnv);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([
				`SEND_MODE must be "mock" or "live" when set, got "prod"`,
				"NEXT_PUBLIC_SAAS_URL is required (the auth base URL and trusted origin)",
				"BETTER_AUTH_SECRET must not be the .env.local.example placeholder value",
			]);
		}
	});
});
