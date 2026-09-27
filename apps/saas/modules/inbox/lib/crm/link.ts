import type { Conversation, InboxViewer } from "@repo/database/inbox";

import type { Runtime } from "../runtime";
import { crmAdapterFor } from "./index";
import type { CrmLead } from "./types";

export type LinkResult =
	| { ok: true; conversation: Conversation }
	| { ok: false; status: 404 | 409; error: "not_found" | "crm_not_connected" | "lead_not_found" };

async function officeAdapter(runtime: Runtime, officeId: string) {
	const connection = await runtime.store.getCrmConnection(officeId);
	return connection
		? {
				connection,
				adapter: (runtime.crm ?? crmAdapterFor)(connection, { store: runtime.store, officeId }),
			}
		: null;
}

/** The manual picker's search (ADR 0003): a person chooses the lead; nothing links on a name alone. */
export async function searchCrmLeads(runtime: Runtime, viewer: InboxViewer, query: string) {
	const crm = await officeAdapter(runtime, viewer.officeId);
	if (!crm)
		return { ok: false as const, status: 409 as const, error: "crm_not_connected" as const };
	return { ok: true as const, leads: await crm.adapter.searchLeads(query) };
}

export async function linkCrmLead(
	runtime: Runtime,
	viewer: InboxViewer,
	conversationId: string,
	leadId: string,
): Promise<LinkResult> {
	const conversation = await runtime.store.getConversation(conversationId, viewer);
	if (!conversation) return { ok: false, status: 404, error: "not_found" };
	const crm = await officeAdapter(runtime, viewer.officeId);
	if (!crm) return { ok: false, status: 409, error: "crm_not_connected" };
	const lead = await crm.adapter.getLead(leadId);
	if (!lead) return { ok: false, status: 404, error: "lead_not_found" };
	const checkedAt = new Date();
	await runtime.store.saveCrmLink(conversationId, {
		kind: crm.connection.kind,
		leadId: lead.id,
		leadName: lead.name,
		method: "manual",
		checkedAt,
	});
	const outcome = (await crm.adapter.outcomesFor([lead.id]))[lead.id];
	if (outcome) {
		await runtime.store.saveCrmOutcomes(
			[
				{
					conversationId,
					outcome: outcome.status,
					outcomeAt: outcome.at ? new Date(outcome.at) : null,
					outcomeReason: outcome.reason,
				},
			],
			checkedAt,
		);
	}
	return {
		ok: true,
		conversation: (await runtime.store.getConversation(conversationId, viewer)) as Conversation,
	};
}

/** Unlinking is remembered as an agent's choice, so phone matching never relinks it. */
export async function unlinkCrmLead(
	runtime: Runtime,
	viewer: InboxViewer,
	conversationId: string,
): Promise<LinkResult> {
	const conversation = await runtime.store.getConversation(conversationId, viewer);
	if (!conversation) return { ok: false, status: 404, error: "not_found" };
	const crm = await officeAdapter(runtime, viewer.officeId);
	if (!crm) return { ok: false, status: 409, error: "crm_not_connected" };
	await runtime.store.saveCrmLink(conversationId, {
		kind: crm.connection.kind,
		leadId: null,
		leadName: null,
		method: "manual",
		checkedAt: new Date(),
	});
	return {
		ok: true,
		conversation: (await runtime.store.getConversation(conversationId, viewer)) as Conversation,
	};
}

export type { CrmLead };
