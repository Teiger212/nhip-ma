import { describe, expect, it } from "vitest";

import { EXAMPLE_BETTER_AUTH_SECRET, validateInboxEnv } from "./env";

const VALID_SECRET = "a".repeat(32);

function baseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
	return {
		BETTER_AUTH_SECRET: VALID_SECRET,
		...overrides,
	} as NodeJS.ProcessEnv;
}

describe("validateInboxEnv", () => {
	it("passes for a minimal valid env", () => {
		expect(validateInboxEnv(baseEnv())).toEqual({ ok: true });
	});

	it("accepts SEND_MODE left unset", () => {
		expect(validateInboxEnv(baseEnv({ SEND_MODE: undefined }))).toEqual({ ok: true });
	});

	it("accepts SEND_MODE=mock", () => {
		expect(validateInboxEnv(baseEnv({ SEND_MODE: "mock" }))).toEqual({ ok: true });
	});

	it("rejects an invalid SEND_MODE value", () => {
		const result = validateInboxEnv(baseEnv({ SEND_MODE: "prod" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([`SEND_MODE must be "mock" or "live" when set, got "prod"`]);
		}
	});

	it("requires WhatsApp and Zalo secrets when SEND_MODE=live", () => {
		const result = validateInboxEnv(baseEnv({ SEND_MODE: "live" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([
				"WHATSAPP_APP_SECRET must be set when SEND_MODE=live",
				"WHATSAPP_ACCESS_TOKEN must be set when SEND_MODE=live",
				"WHATSAPP_PHONE_NUMBER_ID must be set when SEND_MODE=live",
				"ZALO_OA_ACCESS_TOKEN must be set when SEND_MODE=live",
				"ZALO_OA_SECRET_KEY must be set when SEND_MODE=live",
			]);
		}
	});

	it("treats a blank live secret the same as a missing one", () => {
		const result = validateInboxEnv(
			baseEnv({
				SEND_MODE: "live",
				WHATSAPP_APP_SECRET: "   ",
				WHATSAPP_ACCESS_TOKEN: "token",
				WHATSAPP_PHONE_NUMBER_ID: "id",
				ZALO_OA_ACCESS_TOKEN: "token",
				ZALO_OA_SECRET_KEY: "secret",
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual(["WHATSAPP_APP_SECRET must be set when SEND_MODE=live"]);
		}
	});

	it("passes when SEND_MODE=live and every secret is set", () => {
		expect(
			validateInboxEnv(
				baseEnv({
					SEND_MODE: "live",
					WHATSAPP_APP_SECRET: "secret",
					WHATSAPP_ACCESS_TOKEN: "token",
					WHATSAPP_PHONE_NUMBER_ID: "id",
					ZALO_OA_ACCESS_TOKEN: "token",
					ZALO_OA_SECRET_KEY: "secret",
				}),
			),
		).toEqual({ ok: true });
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
				"BETTER_AUTH_SECRET must not be the .env.local.example placeholder value",
			]);
		}
	});
});
