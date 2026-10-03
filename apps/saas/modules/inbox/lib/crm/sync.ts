import type { InboxStore } from "@repo/database/inbox";

import { displayName } from "../display-name";
import type { Conversation } from "../types";
import { crmAdapterFor } from "./adapters";
import { guestIdentity } from "./phone";
import { decideLead } from "./rules";
import type { CrmAdapter } from "./types";

/**
 * The CRM sync module (spec #59): it owns a thread's link to its lead in the office's CRM.
 * Routes and background jobs call it; it calls the pure rules and the adapter, and persists
 * through the store. Races are settled by the database (the link row is the claim).
 */
export function createCrmSync(deps: {
	store: InboxStore;
	/** The address that opens this thread in Nhịp, written on the lead. */
	threadUrl: (conversationId: string) => string;
	/** The office's CRM; tests hand in one that fails. */
	adapterFor?: typeof crmAdapterFor;
}) {
	const adapterFor = deps.adapterFor ?? crmAdapterFor;
	const { store } = deps;
	return {
		/**
		 * A guest wrote on a thread with no lead yet (Q11 to Q13): find the guest's lead in the
		 * office's CRM, or create it, and link the thread. Only the first caller to claim the
		 * thread goes on, so two first messages make one lead. Nothing when the office has no CRM.
		 */
		async newGuest(conversation: Conversation): Promise<void> {
			const connection = await store.getCrmConnection(conversation.officeId);
			if (!connection) return;
			if (!(await store.claimCrmLink(conversation.id, conversation.officeId))) return;
			try {
				await linkLead(
					conversation,
					adapterFor(connection, { store, officeId: conversation.officeId }),
				);
			} catch (error) {
				// A failed write never blocks the thread: the guest's next message tries again.
				await store.releaseCrmLink(conversation.id);
				throw error;
			}
		},
	};

	async function linkLead(conversation: Conversation, crm: CrmAdapter): Promise<void> {
		const identity = guestIdentity(conversation);
		const matches = identity.phone || identity.zaloUserId ? await crm.findLeads(identity) : [];
		const decision = decideLead(matches, identity);
		if (decision.action === "ambiguous") {
			await store.releaseCrmLink(conversation.id);
			return;
		}
		const lead =
			decision.action === "reuse"
				? decision.lead
				: await crm.createLead({
						...identity,
						name: displayName(conversation),
						pipe: conversation.pipe,
						language: conversation.oneShot?.language ?? null,
						fields: conversation.oneShot?.qualification ?? null,
						threadUrl: deps.threadUrl(conversation.id),
					});
		await store.completeCrmLink(conversation.id, {
			leadId: lead.id,
			leadName: lead.name,
			method: decision.method,
		});
	}
}
