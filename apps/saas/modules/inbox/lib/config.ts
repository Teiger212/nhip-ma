import { z } from "zod";

import type { SendMode } from "./types";

/** The literal shipped in `.env.local.example`; never valid in a real deployment. */
export const EXAMPLE_BETTER_AUTH_SECRET = "walkthrough-better-auth-secret-key!";

const trimmed = z
	.string()
	.optional()
	.transform((value) => {
		const clean = value?.trim();
		return clean ? clean : undefined;
	});

function isAbsoluteUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function stripSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

const envSchema = z
	.object({
		SEND_MODE: trimmed,
		WHATSAPP_VERIFY_TOKEN: trimmed,
		WHATSAPP_APP_SECRET: trimmed,
		WHATSAPP_ACCESS_TOKEN: trimmed,
		WHATSAPP_PHONE_NUMBER_ID: trimmed,
		ZALO_OA_ACCESS_TOKEN: trimmed,
		ZALO_OA_SECRET_KEY: trimmed,
		DRAFT_API_KEY: trimmed,
		DRAFT_BASE_URL: trimmed,
		DRAFT_MODEL: trimmed,
		BETTER_AUTH_SECRET: z.string().optional(),
		BETTER_AUTH_URL: trimmed,
		NEXT_PUBLIC_SAAS_URL: trimmed,
		AUTH_TRUSTED_ORIGINS: trimmed,
		NODE_ENV: z.string().optional(),
	})
	.superRefine((env, ctx) => {
		if (env.SEND_MODE !== undefined && env.SEND_MODE !== "mock" && env.SEND_MODE !== "live") {
			ctx.addIssue({
				code: "custom",
				path: ["SEND_MODE"],
				message: `SEND_MODE must be "mock" or "live" when set, got "${env.SEND_MODE}"`,
			});
		}
		if (env.SEND_MODE === "live") {
			for (const key of [
				"WHATSAPP_APP_SECRET",
				"WHATSAPP_ACCESS_TOKEN",
				"WHATSAPP_PHONE_NUMBER_ID",
				"ZALO_OA_ACCESS_TOKEN",
				"ZALO_OA_SECRET_KEY",
			] as const) {
				if (!env[key]) {
					ctx.addIssue({
						code: "custom",
						path: [key],
						message: `${key} must be set when SEND_MODE=live`,
					});
				}
			}
		}
		// A model id is never defaulted in code, where it would go stale; a key alone is a
		// misconfiguration, not "no model".
		if (env.DRAFT_API_KEY && !env.DRAFT_MODEL) {
			ctx.addIssue({
				code: "custom",
				path: ["DRAFT_MODEL"],
				message: "DRAFT_MODEL must be set when DRAFT_API_KEY is set",
			});
		}
		if (env.DRAFT_BASE_URL && !isAbsoluteUrl(env.DRAFT_BASE_URL)) {
			ctx.addIssue({
				code: "custom",
				path: ["DRAFT_BASE_URL"],
				message: `DRAFT_BASE_URL must be an absolute http(s) URL, got "${env.DRAFT_BASE_URL}"`,
			});
		}
		// Better Auth's baseURL is set explicitly from NEXT_PUBLIC_SAAS_URL and wins over
		// BETTER_AUTH_URL, so the two must agree or one of them is silently ignored.
		if (!env.NEXT_PUBLIC_SAAS_URL) {
			ctx.addIssue({
				code: "custom",
				path: ["NEXT_PUBLIC_SAAS_URL"],
				message: "NEXT_PUBLIC_SAAS_URL is required (the auth base URL and trusted origin)",
			});
		} else if (!isAbsoluteUrl(env.NEXT_PUBLIC_SAAS_URL)) {
			ctx.addIssue({
				code: "custom",
				path: ["NEXT_PUBLIC_SAAS_URL"],
				message: `NEXT_PUBLIC_SAAS_URL must be an absolute http(s) URL, got "${env.NEXT_PUBLIC_SAAS_URL}"`,
			});
		} else {
			if (env.NODE_ENV === "production" && !env.NEXT_PUBLIC_SAAS_URL.startsWith("https://")) {
				ctx.addIssue({
					code: "custom",
					path: ["NEXT_PUBLIC_SAAS_URL"],
					message: "NEXT_PUBLIC_SAAS_URL must use https in production (secure cookies)",
				});
			}
			if (
				env.BETTER_AUTH_URL &&
				stripSlash(env.BETTER_AUTH_URL) !== stripSlash(env.NEXT_PUBLIC_SAAS_URL)
			) {
				ctx.addIssue({
					code: "custom",
					path: ["BETTER_AUTH_URL"],
					message:
						"BETTER_AUTH_URL is set but differs from NEXT_PUBLIC_SAAS_URL; unset it or make them match",
				});
			}
		}
		if (env.NODE_ENV === "production" && env.AUTH_TRUSTED_ORIGINS) {
			ctx.addIssue({
				code: "custom",
				path: ["AUTH_TRUSTED_ORIGINS"],
				message:
					"AUTH_TRUSTED_ORIGINS is a local/tunnel convenience and must be unset in production",
			});
		}

		if (!env.BETTER_AUTH_SECRET) {
			ctx.addIssue({
				code: "custom",
				path: ["BETTER_AUTH_SECRET"],
				message: "BETTER_AUTH_SECRET is required",
			});
		} else {
			if (env.BETTER_AUTH_SECRET.length < 32) {
				ctx.addIssue({
					code: "custom",
					path: ["BETTER_AUTH_SECRET"],
					message: "BETTER_AUTH_SECRET must be at least 32 characters",
				});
			}
			if (env.BETTER_AUTH_SECRET === EXAMPLE_BETTER_AUTH_SECRET) {
				ctx.addIssue({
					code: "custom",
					path: ["BETTER_AUTH_SECRET"],
					message: "BETTER_AUTH_SECRET must not be the .env.local.example placeholder value",
				});
			}
		}
	});

/**
 * Everything the inbox reads from the environment, settled once. Route handlers and
 * send adapters read these fields; nothing downstream touches `process.env`.
 */
export type InboxConfig = {
	/** Only the exact value `live` talks to WhatsApp/Zalo. Anything else is mock. */
	sendMode: SendMode;
	whatsapp: {
		verifyToken?: string;
		appSecret?: string;
		accessToken?: string;
		phoneNumberId?: string;
	};
	zalo: {
		accessToken?: string;
		oaSecretKey?: string;
	};
	/**
	 * The draft adapter (ADR 0005, ADR 0007): any OpenAI-compatible chat endpoint. Without
	 * a key there is no model: no translation is shown and every suggested reply is a
	 * template. The model id is whatever the office chose; nothing here names a vendor.
	 */
	drafts: {
		apiKey?: string;
		baseUrl: string;
		model?: string;
	};
};

/** OpenRouter fronts every vendor behind one prepaid balance, which doubles as the budget. */
export const DEFAULT_DRAFT_BASE_URL = "https://openrouter.ai/api/v1";

export function resolveSendMode(value: string | undefined): SendMode {
	return value === "live" ? "live" : "mock";
}

/** Build the config from raw env without validating; used by the runtime as the fallback. */
export function inboxConfigFromEnv(env: NodeJS.ProcessEnv): InboxConfig {
	const clean = (value: string | undefined) => value?.trim() || undefined;
	return {
		sendMode: resolveSendMode(clean(env.SEND_MODE)),
		whatsapp: {
			verifyToken: clean(env.WHATSAPP_VERIFY_TOKEN),
			appSecret: clean(env.WHATSAPP_APP_SECRET),
			accessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
			phoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
		},
		zalo: {
			accessToken: clean(env.ZALO_OA_ACCESS_TOKEN),
			oaSecretKey: clean(env.ZALO_OA_SECRET_KEY),
		},
		drafts: {
			apiKey: clean(env.DRAFT_API_KEY),
			baseUrl: clean(env.DRAFT_BASE_URL) ?? DEFAULT_DRAFT_BASE_URL,
			model: clean(env.DRAFT_MODEL),
		},
	};
}

export type ValidateInboxEnvResult =
	| { ok: true; config: InboxConfig }
	| { ok: false; errors: string[] };

/**
 * Validates the env the inbox depends on and returns the settled config. Never throws;
 * callers decide whether a failure is fatal (see `instrumentation.ts`).
 */
export function validateInboxEnv(env: NodeJS.ProcessEnv): ValidateInboxEnvResult {
	const result = envSchema.safeParse(env);
	if (!result.success) {
		return { ok: false, errors: result.error.issues.map((issue) => issue.message) };
	}
	return { ok: true, config: inboxConfigFromEnv(env) };
}

/** A minimal config for tests and scripts: mock send, no credentials, no model, unowned threads. */
export function mockInboxConfig(overrides: Partial<InboxConfig> = {}): InboxConfig {
	return {
		sendMode: "mock",
		whatsapp: {},
		zalo: {},
		drafts: { baseUrl: DEFAULT_DRAFT_BASE_URL },
		...overrides,
	};
}
