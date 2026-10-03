import type { CrmKind, InboxStore } from "@repo/database/inbox";

import type { InboxConfig } from "../config";
import { mockCrmAdapter } from "./mock";
import { readMockCrmWebhook } from "./mock-webhook";
import type { CrmAdapter } from "./types";

/** The only place a CRM kind becomes an adapter (ADR 0003). */
export function crmAdapterFor(
	connection: { kind: CrmKind },
	deps: { store: InboxStore; officeId: string },
): CrmAdapter {
	switch (connection.kind) {
		case "mock":
			return mockCrmAdapter(deps.store, deps.officeId);
	}
}

/** A CRM's outcome notice, verified: the office it is for and the leads that changed. */
export type CrmNotice = { officeId: string; leadIds: string[] };

/**
 * How a CRM kind's outcome webhook is verified and read (ADR 0003), or null when this
 * deployment has no such webhook (then it answers 404). Nothing unverified is ever returned.
 */
export function crmWebhookFor(
	kind: CrmKind,
	config: InboxConfig,
): ((rawBody: string, headers: Headers) => CrmNotice | null) | null {
	switch (kind) {
		case "mock": {
			const secret = config.mockCrmWebhookSecret;
			return secret
				? (rawBody, headers) =>
						readMockCrmWebhook(rawBody, headers.get("x-mock-crm-signature"), secret)
				: null;
		}
	}
}
