import type { InboxStore } from "@repo/database/inbox";

import { type CrmAdapter, CrmError } from "./types";

/**
 * The mock CRM (ADR 0003): leads in Nhịp's own database, for development, tests and the demo.
 * It can be down for an office (#211), as a real CRM can: then every call fails.
 */
export function mockCrmAdapter(store: InboxStore, officeId: string): CrmAdapter {
	async function reachable(): Promise<void> {
		if (await store.mockCrmDown(officeId)) throw new CrmError("The mock CRM is down", "other");
	}
	return {
		async findLeads({ phone, zaloUserId }) {
			await reachable();
			const found = [
				...(phone ? await store.findMockCrmLeads(officeId, { phone }) : []),
				...(zaloUserId ? await store.findMockCrmLeads(officeId, { zaloUserId }) : []),
			];
			const unique = new Map(found.map((lead) => [lead.id, { id: lead.id, name: lead.name }]));
			return [...unique.values()];
		},
		async outcomesFor(leadIds) {
			await reachable();
			const leads = await store.findMockCrmLeads(officeId, { ids: leadIds });
			return Object.fromEntries(
				leads.map((lead) => [
					lead.id,
					{ status: lead.outcome, at: lead.outcomeAt, reason: lead.outcomeReason },
				]),
			);
		},
		async createLead(guest) {
			await reachable();
			const lead = await store.createMockCrmLead({ officeId, ...guest });
			return { id: lead.id, name: lead.name };
		},
		async accountId() {
			return officeId;
		},
	};
}
