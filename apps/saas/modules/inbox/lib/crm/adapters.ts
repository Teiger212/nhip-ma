import type { CrmKind, InboxStore } from "@repo/database/inbox";

import type { InboxConfig } from "../config";
import { hubspotCrmAdapter } from "./hubspot";
import { readHubSpotWebhook } from "./hubspot-webhook";
import { mockCrmAdapter } from "./mock";
import { readMockCrmWebhook } from "./mock-webhook";
import { type CrmAdapter, CrmError, type CrmNotice, type CrmWebhookRequest } from "./types";

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

/**
 * The CRM kinds whose one app serves many accounts, so a webhook names the CRM's account and
 * the office on it is found by the account id its adapter reports (#66). For the others the
 * account a webhook names is the office itself, and their adapter is never asked for it.
 */
const KINDS_WITH_ACCOUNT: readonly CrmKind[] = ["hubspot"];

/** Whether a webhook from this CRM kind names the CRM's own account rather than the office. */
export function crmKindHasAccount(kind: CrmKind): boolean {
	return KINDS_WITH_ACCOUNT.includes(kind);
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
			if (!connection.token) throw new CrmError("The office's CRM has no access token", "auth");
			return hubspotCrmAdapter({ token: connection.token });
	}
}

/**
 * How a CRM kind's outcome webhook is verified and read (ADR 0003): the accounts and their
 * changed leads, checked at `now`, or null when unverified. The reader is null when this
 * deployment has no such webhook (then it answers 404). Nothing unverified is ever returned.
 */
export function crmWebhookFor(
	kind: CrmKind,
	config: InboxConfig,
): ((request: CrmWebhookRequest, now: Date) => CrmNotice[] | null) | null {
	switch (kind) {
		case "mock": {
			const secret = config.mockCrmWebhookSecret;
			if (!secret) return null;
			return ({ rawBody, headers }) => {
				const notice = readMockCrmWebhook(rawBody, headers.get("x-mock-crm-signature"), secret);
				// The mock's account is the office itself.
				return notice ? [{ account: notice.officeId, leadIds: notice.leadIds }] : null;
			};
		}
		case "hubspot": {
			const { hubspotAppClientSecret: clientSecret, hubspotWebhookUrl: url } = config;
			if (!clientSecret || !url) return null;
			return (request, now) => readHubSpotWebhook(request, { clientSecret, url }, now);
		}
	}
}
