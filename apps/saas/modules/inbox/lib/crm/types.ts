import type { CrmKind, CrmOutcomeStatus, Pipe } from "../types";

/**
 * One adapter per CRM (ADR 0003), shaped like the pipe adapters: product code never names
 * a vendor. Identity matching (phone formats, ids) lives inside each adapter.
 */
export type CrmLead = { id: string; name: string; phone: string | null };

export type CrmOutcome = { status: CrmOutcomeStatus; at: string | null; reason: string | null };

export type CrmAdapter = {
	kind: CrmKind;
	/**
	 * Automatic match, phone only (ADR 0003). null when the guest has no phone, nothing
	 * matches, or more than one lead does: an ambiguous match is left to a manager.
	 */
	findLeadForConversation(conversation: { pipe: Pipe; guestId: string }): Promise<CrmLead | null>;
	/** For the manager's manual picker. The manager chooses; nothing links on a name by itself. */
	searchLeads(query: string): Promise<CrmLead[]>;
	getLead(id: string): Promise<CrmLead | null>;
	/** Current outcome per lead id; ids the CRM does not know are absent. */
	outcomesFor(leadIds: string[]): Promise<Record<string, CrmOutcome>>;
};
