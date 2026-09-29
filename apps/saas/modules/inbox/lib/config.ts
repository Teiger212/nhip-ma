import { z } from "zod";

import { isValidSecretsKey } from "./pipes/secrets";
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

/** Each pipe's app-level settings: all set, or none (then the pipe never sends live). */
const PIPE_SETTINGS = {
	whatsapp: ["WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
	zalo: ["ZALO_APP_ID", "ZALO_APP_SECRET", "ZALO_OA_SECRET_KEY"],
} as const;

/** Pipes that keep per-office tokens, which PIPE_SECRETS_KEY encrypts (set on its own is fine). */
const PIPES_WITH_STORED_TOKENS = ["zalo"] as const;

const envSchema = z
	.object({
		SEND_MODE: trimmed,
		WHATSAPP_VERIFY_TOKEN: trimmed,
		WHATSAPP_APP_SECRET: trimmed,
		WHATSAPP_ACCESS_TOKEN: trimmed,
		WHATSAPP_PHONE_NUMBER_ID: trimmed,
		ZALO_APP_ID: trimmed,
		ZALO_APP_SECRET: trimmed,
		ZALO_OA_SECRET_KEY: trimmed,
		PIPE_SECRETS_KEY: trimmed,
		DRAFT_API_KEY: trimmed,
		DRAFT_BASE_URL: trimmed,
		DRAFT_MODEL: trimmed,
		BETTER_AUTH_SECRET: z.string().optional(),
		BETTER_AUTH_URL: trimmed,
		NEXT_PUBLIC_SAAS_URL: trimmed,
		AUTH_TRUSTED_ORIGINS: trimmed,
		NODE_ENV: z.string().optional(),
		/** Set only by the E2E run (`.env.e2e`): a production build served on localhost. */
		E2E: trimmed,
	})
	.superRefine((env, ctx) => {
		if (env.SEND_MODE !== undefined && env.SEND_MODE !== "mock" && env.SEND_MODE !== "live") {
			ctx.addIssue({
				code: "custom",
				path: ["SEND_MODE"],
				message: `SEND_MODE must be "mock" or "live" when set, got "${env.SEND_MODE}"`,
			});
		}
		// A pipe is configured whole or not at all (ADR 0017): its app-level settings live here,
		// each office's tokens on its pipe connection. A pipe left unconfigured never sends live.
		for (const [pipe, keys] of Object.entries(PIPE_SETTINGS)) {
			const set = keys.filter((key) => env[key]);
			if (set.length > 0 && set.length < keys.length) {
				for (const key of keys.filter((k) => !env[k])) {
					ctx.addIssue({
						code: "custom",
						path: [key],
						message: `${key} must be set: ${pipe} is configured only in part (${set.join(", ")} set)`,
					});
				}
			}
		}
		// The E2E profile commits test-only pipe secrets (.env.e2e); a live deployment refuses them.
		if (env.SEND_MODE === "live") {
			for (const key of ["ZALO_APP_SECRET", "ZALO_OA_SECRET_KEY", "PIPE_SECRETS_KEY"] as const) {
				const value = env[key];
				const plain =
					key === "PIPE_SECRETS_KEY" && value
						? Buffer.from(value, "base64").toString("latin1")
						: value;
				if (plain?.includes("e2e-only")) {
					ctx.addIssue({
						code: "custom",
						path: [key],
						message: `${key} is the E2E profile's test value and must not be used when SEND_MODE=live`,
					});
				}
			}
		}
		for (const pipe of PIPES_WITH_STORED_TOKENS) {
			if (PIPE_SETTINGS[pipe].some((key) => env[key]) && !env.PIPE_SECRETS_KEY) {
				ctx.addIssue({
					code: "custom",
					path: ["PIPE_SECRETS_KEY"],
					message: `PIPE_SECRETS_KEY must be set: ${pipe} stores each office's tokens encrypted with it`,
				});
			}
		}
		if (env.PIPE_SECRETS_KEY && !isValidSecretsKey(env.PIPE_SECRETS_KEY)) {
			ctx.addIssue({
				code: "custom",
				path: ["PIPE_SECRETS_KEY"],
				message: "PIPE_SECRETS_KEY must be 32 random bytes, base64-encoded",
			});
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
			// The one exception is the E2E run: a production build on this machine, where no
			// certificate exists. It needs E2E=1 and a localhost URL, so a real host never
			// qualifies. Temporary until E2E runs on a proper environment (AGENTS.md).
			const e2eOnLocalhost = env.E2E === "1" && isLocalhostUrl(env.NEXT_PUBLIC_SAAS_URL);
			if (
				env.NODE_ENV === "production" &&
				!env.NEXT_PUBLIC_SAAS_URL.startsWith("https://") &&
				!e2eOnLocalhost
			) {
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
function isLocalhostUrl(value: string): boolean {
	try {
		const host = new URL(value).hostname;
		return host === "localhost" || host === "127.0.0.1";
	} catch {
		return false;
	}
}

export type InboxConfig = {
	/**
	 * The deployment-wide switch: nothing is sent live unless this is exactly `live`, and
	 * then only on a connected pipe (ADR 0017, `transmit`).
	 */
	sendMode: SendMode;
	whatsapp: {
		verifyToken?: string;
		appSecret?: string;
		accessToken?: string;
		phoneNumberId?: string;
	};
	/** Nhịp's Zalo app; each OA's tokens are on its pipe connection (ADR 0017). */
	zalo: {
		appId?: string;
		appSecret?: string;
		/** Signs Zalo's webhooks. */
		oaSecretKey?: string;
	};
	/** Encrypts vendor tokens at rest (`pipes/secrets.ts`). */
	pipeSecretsKey?: string;
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
			appId: clean(env.ZALO_APP_ID),
			appSecret: clean(env.ZALO_APP_SECRET),
			oaSecretKey: clean(env.ZALO_OA_SECRET_KEY),
		},
		pipeSecretsKey: clean(env.PIPE_SECRETS_KEY),
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
