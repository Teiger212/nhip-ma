import type { InboxStore } from "@repo/database/inbox";

import type { CrmAdapter } from "./types";

/** The mock CRM (ADR 0003): leads in Nhịp's own database, for development, tests and the demo. */
export function mockCrmAdapter(store: InboxStore, officeId: string): CrmAdapter {
	return {
		kind: "mock",
		async findLeads({ phone, zaloUserId }) {
			const found = [
				...(phone ? await store.findMockCrmLeads(officeId, { phone }) : []),
				...(zaloUserId ? await store.findMockCrmLeads(officeId, { zaloUserId }) : []),
			];
			const unique = new Map(found.map((lead) => [lead.id, { id: lead.id, name: lead.name }]));
			return [...unique.values()];
		},
		async createLead(guest) {
			const lead = await store.createMockCrmLead({ officeId, ...guest });
			return { id: lead.id, name: lead.name };
		},
	};
}
