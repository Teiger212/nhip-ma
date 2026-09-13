import { createInboxStore, sqlitePathFromEnv, type InboxStore } from "@repo/database/inbox";

import { type InboxConfig, inboxConfigFromEnv, validateInboxEnv } from "./config";

export type Runtime = {
	store: InboxStore;
	config: InboxConfig;
};

type GlobalRuntime = typeof globalThis & { __nhipRuntime?: Runtime; __nhipConfig?: InboxConfig };

let override: Runtime | null = null;

/**
 * Called once at startup (`instrumentation.ts`) with the config that validation
 * produced, so the runtime never re-derives it from `process.env`.
 */
export function installInboxConfig(config: InboxConfig): void {
	(globalThis as GlobalRuntime).__nhipConfig = config;
}

function resolveConfig(): InboxConfig {
	const installed = (globalThis as GlobalRuntime).__nhipConfig;
	if (installed) return installed;
	// Startup did not run (scripts, tests without an override). Validate here so the
	// same rules apply, but do not fail: scripts run against mock by default.
	const result = validateInboxEnv(process.env);
	return result.ok ? result.config : inboxConfigFromEnv(process.env);
}

export function getRuntime(): Runtime {
	if (override) {
		return override;
	}
	const g = globalThis as GlobalRuntime;
	if (!g.__nhipRuntime) {
		g.__nhipRuntime = {
			store: createInboxStore(sqlitePathFromEnv()),
			config: resolveConfig(),
		};
	}
	return g.__nhipRuntime;
}

export function peekTestRuntime(): Runtime | null {
	return override;
}

export function setRuntimeForTests(runtime: Runtime | null): void {
	override = runtime;
}

export { resolveSendMode } from "./config";
