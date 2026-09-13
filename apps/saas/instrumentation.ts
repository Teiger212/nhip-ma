import { validateInboxEnv } from "@inbox/lib/config";
import { installInboxConfig } from "@inbox/lib/runtime";

/**
 * Runs once when a new Next.js server instance is initiated (see the
 * `instrumentation.ts` file convention). Fails loud on production so a
 * misconfigured deploy never serves the walk against WhatsApp/Zalo with a
 * bad secret; fails quiet (console only) in dev so the local server keeps
 * running while the operator fixes `.env.local`. On success the settled
 * config is handed to the inbox runtime so nothing downstream re-reads env.
 */
export function register() {
	const result = validateInboxEnv(process.env);
	if (result.ok) {
		installInboxConfig(result.config);
		return;
	}

	for (const error of result.errors) {
		console.error(`[env] ${error}`);
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error(`Invalid environment configuration:\n${result.errors.join("\n")}`);
	}
}
