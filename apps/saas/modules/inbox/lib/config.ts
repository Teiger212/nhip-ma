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

const envSchema = z
	.object({
		SEND_MODE: trimmed,
		WHATSAPP_VERIFY_TOKEN: trimmed,
		WHATSAPP_APP_SECRET: trimmed,
		WHATSAPP_ACCESS_TOKEN: trimmed,
		WHATSAPP_PHONE_NUMBER_ID: trimmed,
		ZALO_OA_ACCESS_TOKEN: trimmed,
		ZALO_OA_SECRET_KEY: trimmed,
		INBOX_OWNER_USER_ID: trimmed,
		BETTER_AUTH_SECRET: z.string().optional(),
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
	/** Owner assigned to threads created by webhooks. `null` means unowned. */
	webhookOwnerUserId: string | null;
};

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
		webhookOwnerUserId: clean(env.INBOX_OWNER_USER_ID) ?? null,
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

/** A minimal config for tests and scripts: mock send, no credentials, unowned threads. */
export function mockInboxConfig(overrides: Partial<InboxConfig> = {}): InboxConfig {
	return {
		sendMode: "mock",
		whatsapp: {},
		zalo: {},
		webhookOwnerUserId: null,
		...overrides,
	};
}
