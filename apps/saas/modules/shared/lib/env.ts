import { z } from "zod";

/** The literal shipped in `.env.local.example` — never valid in a real deployment. */
export const EXAMPLE_BETTER_AUTH_SECRET = "walkthrough-better-auth-secret-key!";

const WHATSAPP_ZALO_LIVE_KEYS = [
	"WHATSAPP_APP_SECRET",
	"WHATSAPP_ACCESS_TOKEN",
	"WHATSAPP_PHONE_NUMBER_ID",
	"ZALO_OA_ACCESS_TOKEN",
	"ZALO_OA_SECRET_KEY",
] as const;

const envSchema = z
	.object({
		SEND_MODE: z.string().optional(),
		WHATSAPP_APP_SECRET: z.string().optional(),
		WHATSAPP_ACCESS_TOKEN: z.string().optional(),
		WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
		ZALO_OA_ACCESS_TOKEN: z.string().optional(),
		ZALO_OA_SECRET_KEY: z.string().optional(),
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
			for (const key of WHATSAPP_ZALO_LIVE_KEYS) {
				if (!env[key] || env[key].trim().length === 0) {
					ctx.addIssue({
						code: "custom",
						path: [key],
						message: `${key} must be set when SEND_MODE=live`,
					});
				}
			}
		}

		if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length === 0) {
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

export type ValidateInboxEnvResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Validates the subset of env vars the inbox walk depends on. Never throws —
 * callers decide whether a failure is fatal (see `instrumentation.ts`).
 */
export function validateInboxEnv(env: NodeJS.ProcessEnv): ValidateInboxEnvResult {
	const result = envSchema.safeParse(env);
	if (result.success) {
		return { ok: true };
	}

	return {
		ok: false,
		errors: result.error.issues.map((issue) => issue.message),
	};
}
