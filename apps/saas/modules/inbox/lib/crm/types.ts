import type { CrmKind, Pipe, Qualification } from "../types";

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

export type CrmAdapter = {
	kind: CrmKind;
	/** The CRM's leads for this guest; empty when it knows none. */
	findLeads(identity: GuestIdentity): Promise<CrmLead[]>;
	/** Write the guest into the CRM as a new lead. */
	createLead(guest: NewGuestLead): Promise<CrmLead>;
};
