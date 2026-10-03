import type { InboxStore } from "@repo/database/inbox";

import { guestPhone } from "./phone";
import type { CrmAdapter, CrmLead, CrmOutcome } from "./types";

/** The store returns at most this many mock leads per read. */
const PAGE = 20;

const toLead = (row: { id: string; name: string; phone: string | null }): CrmLead => ({
	id: row.id,
	name: row.name,
	phone: row.phone,
});

/** The mock CRM (ADR 0003): leads in a local table, for development, tests and the demo. */
export function mockCrmAdapter(store: InboxStore, officeId: string): CrmAdapter {
	return {
		kind: "mock",
		async findLeadForConversation(conversation) {
			const phone = guestPhone(conversation);
			if (!phone) return null;
			const leads = await store.findMockCrmLeads(officeId, { phone });
			return leads.length === 1 ? toLead(leads[0]) : null;
		},
		async searchLeads(query) {
			const trimmed = query.trim();
			if (!trimmed) return [];
			return (await store.findMockCrmLeads(officeId, { query: trimmed })).map(toLead);
		},
		async getLead(id) {
			const [lead] = await store.findMockCrmLeads(officeId, { ids: [id] });
			return lead ? toLead(lead) : null;
		},
		async outcomesFor(leadIds) {
			const outcomes: Record<string, CrmOutcome> = {};
			for (let start = 0; start < leadIds.length; start += PAGE) {
				const ids = leadIds.slice(start, start + PAGE);
				for (const lead of await store.findMockCrmLeads(officeId, { ids })) {
					outcomes[lead.id] = {
						status: lead.outcome,
						at: lead.outcomeAt,
						reason: lead.outcomeReason,
					};
				}
			}
			return outcomes;
		},
	};
}
