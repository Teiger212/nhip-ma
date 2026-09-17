/**
 * Startup env validation lives with the inbox runtime that consumes it.
 * Kept here so `@shared/lib/env` stays a valid import.
 */
export {
	EXAMPLE_BETTER_AUTH_SECRET,
	validateInboxEnv,
	type InboxConfig,
	type ValidateInboxEnvResult,
} from "@inbox/lib/config";
