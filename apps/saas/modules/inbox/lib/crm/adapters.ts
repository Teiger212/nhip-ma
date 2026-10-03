import type { CrmKind, InboxStore } from "@repo/database/inbox";

import type { InboxConfig } from "../config";
import { hubspotCrmAdapter } from "./hubspot";
import { mockCrmAdapter } from "./mock";
import { readMockCrmWebhook } from "./mock-webhook";
import type { CrmAdapter } from "./types";

/**
 * The office's CRM as an adapter is opened with: its kind and, for a kind that takes one, the
 * office's access token in the clear. The CRM sync opens the sealed token for this alone; it is
 * never stored, logged or sent anywhere but to the CRM.
 */
export type CrmAdapterConnection = { kind: CrmKind; token: string | null };

/** The CRM kinds an office connects with an access token the platform admin enters (ADR 0003). */
const KINDS_WITH_TOKEN: readonly CrmKind[] = ["hubspot"];

/** Whether connecting an office to this CRM kind takes an access token. */
export function crmKindTakesToken(kind: CrmKind | null): boolean {
	return kind !== null && KINDS_WITH_TOKEN.includes(kind);
}

/** The only place a CRM kind becomes an adapter (ADR 0003). */
export function crmAdapterFor(
	connection: CrmAdapterConnection,
	deps: { store: InboxStore; officeId: string },
): CrmAdapter {
	switch (connection.kind) {
		case "mock":
			return mockCrmAdapter(deps.store, deps.officeId);
		case "hubspot":
			if (!connection.token) throw new Error("The office's CRM has no access token");
			return hubspotCrmAdapter({ token: connection.token });
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
		case "hubspot":
			// HubSpot's signed webhooks come with #66.
			return null;
	}
}
