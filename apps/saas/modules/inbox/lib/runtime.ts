import { db } from "@repo/database";
import { createInboxStore, type InboxStore } from "@repo/database/inbox";

import { type InboxConfig, inboxConfigFromEnv, validateInboxEnv } from "./config";
import { type DraftAdapter, draftAdapterFromConfig } from "./drafts";

export type Runtime = {
	store: InboxStore;
	config: InboxConfig;
	/** The model seam for translation and follow-up drafts (ADR 0005). */
	drafts: DraftAdapter;
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
		const config = resolveConfig();
		g.__nhipRuntime = {
			store: createInboxStore(db),
			config,
			drafts: draftAdapterFromConfig(config),
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
