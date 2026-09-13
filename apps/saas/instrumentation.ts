/**
 * Runs once when a new Next.js server instance is initiated (see the
 * `instrumentation.ts` file convention). Fails loud on production so a
 * misconfigured deploy never serves the walk against WhatsApp/Zalo with a
 * bad secret; fails quiet (console only) in dev so the local server keeps
 * running while the operator fixes `.env.local`. On success the settled
 * config is handed to the inbox runtime so nothing downstream re-reads env.
 *
 * Next bundles this file for both runtimes. The inbox runtime opens SQLite, which
 * only exists on Node, so everything is imported lazily behind the runtime check.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}
	const [{ validateInboxEnv }, { installInboxConfig }] = await Promise.all([
		import("@inbox/lib/config"),
		import("@inbox/lib/runtime"),
	]);
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
