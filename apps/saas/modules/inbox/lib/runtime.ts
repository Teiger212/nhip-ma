import { createInboxStore, sqlitePathFromEnv, type InboxStore } from "@repo/database/inbox";

import type { SendMode, InboxEnv } from "./types";

export type Runtime = {
	store: InboxStore;
	sendMode: SendMode;
	env: InboxEnv;
};

type GlobalRuntime = typeof globalThis & { __nhipRuntime?: Runtime };

let override: Runtime | null = null;

/** Only the exact value `live` talks to WhatsApp/Zalo. Anything else is mock. */
export function resolveSendMode(value: string | undefined): SendMode {
	return value === "live" ? "live" : "mock";
}

export function getRuntime(): Runtime {
	if (override) {
		return override;
	}
	const g = globalThis as GlobalRuntime;
	if (!g.__nhipRuntime) {
		g.__nhipRuntime = {
			store: createInboxStore(sqlitePathFromEnv()),
			sendMode: resolveSendMode(process.env.SEND_MODE),
			env: process.env,
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
