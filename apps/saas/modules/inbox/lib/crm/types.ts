import type { CrmOutcomeStatus, Pipe, Qualification } from "../types";

/**
 * One adapter per CRM (ADR 0003), shaped like the pipe adapters: product code never names a
 * vendor. Each adapter matches a guest to its leads in its own way.
 */
export type CrmLead = { id: string; name: string };

/** How the CRM can know a guest: an E.164 phone (WhatsApp), or the Zalo user id Nhịp stored. */
export type GuestIdentity = { phone: string | null; zaloUserId: string | null };

/** What Nhịp writes into the CRM for a new guest (spec #59, Q12): never message text. */
export type NewGuestLead = GuestIdentity & {
	name: string;
	pipe: Pipe;
	language: string | null;
	fields: Qualification | null;
	threadUrl: string;
};

/** What the CRM says about a lead now: open, won or lost, with its own date and reason. */
export type LeadOutcome = { status: CrmOutcomeStatus; at: string | null; reason: string | null };

export type CrmAdapter = {
	/** The CRM's leads for this guest; empty when it knows none. */
	findLeads(identity: GuestIdentity): Promise<CrmLead[]>;
	/** Write the guest into the CRM as a new lead. */
	createLead(guest: NewGuestLead): Promise<CrmLead>;
	/** What the CRM says now about each of these leads; leads it does not know are absent. */
	outcomesFor(leadIds: string[]): Promise<Record<string, LeadOutcome>>;
	/**
	 * The CRM's own id for the account the office's connection reaches, which its webhook names
	 * (#66). Asked only of a kind whose one app serves many accounts (`crmKindHasAccount`); the
	 * mock's account is the office itself.
	 */
	accountId(): Promise<string>;
};

/**
 * A CRM's outcome notice, verified: the CRM's own account it came from (for the mock, the office
 * id) and the leads that changed there. One webhook call can carry several accounts' notices.
 */
export type CrmNotice = { account: string; leadIds: string[] };

/** A CRM webhook's request, as its reader needs it: nothing but these is signed. */
export type CrmWebhookRequest = { method: string; rawBody: string; headers: Headers };

/**
 * What kind of failure a CRM call was (#211), the only thing a failed lead write is logged with:
 * never the thread's, the guest's or the CRM's ids, nor the CRM's message, which can echo guest
 * data (PDPL).
 */
export type CrmFailureKind = "timeout" | "auth" | "rejected" | "other";

/** A CRM call that failed, and its kind. Its message names the operation and status only. */
export class CrmError extends Error {
	constructor(
		message: string,
		readonly kind: CrmFailureKind,
	) {
		super(message);
		this.name = "CrmError";
	}
}
