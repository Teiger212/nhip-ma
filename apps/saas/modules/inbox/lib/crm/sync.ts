import type { InboxStore } from "@repo/database/inbox";

import { displayName } from "../display-name";
import { crmTokenContext, decryptSecret, encryptSecret } from "../pipes/secrets";
import type { Conversation, CrmKind } from "../types";
import { type CrmAdapterConnection, crmAdapterFor, crmKindTakesToken } from "./adapters";
import { guestIdentity } from "./phone";
import { decideLead, observeOutcome } from "./rules";
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
	/**
	 * The deployment's key for tokens at rest (`PIPE_SECRETS_KEY`, ADR 0017). Without it no
	 * office can be connected to a CRM that takes a token, and none such can be opened.
	 */
	secretsKey?: string;
	/** The office's CRM; tests hand in one that fails. */
	adapterFor?: typeof crmAdapterFor;
}) {
	const adapterFor = deps.adapterFor ?? crmAdapterFor;
	const { store, secretsKey } = deps;

	/** The office's CRM, with its access token opened for the adapter; null when it has none. */
	async function connectionOf(officeId: string): Promise<CrmAdapterConnection | null> {
		const connection = await store.getCrmConnection(officeId);
		if (!connection) return null;
		if (!crmKindTakesToken(connection.kind)) return { kind: connection.kind, token: null };
		const sealed = await store.getCrmAccessToken(officeId);
		const token =
			sealed && secretsKey
				? decryptSecret(sealed, secretsKey, crmTokenContext(connection.kind, officeId))
				: null;
		return { kind: connection.kind, token };
	}

	return {
		/**
		 * The platform admin sets the office's CRM, or none (spec #59, Q6). The same CRM again
		 * keeps the office's links; another, or none, drops them: another CRM's leads mean nothing.
		 * Their cached outcomes go with them, so a won or lost thread whose guest spoke last is
		 * back in Your turn (missing data never hides a guest).
		 *
		 * A CRM that takes an access token (#65) is connected only with one, sealed before it is
		 * stored (ADR 0017); the same CRM with a new token replaces it and keeps the links. Nothing
		 * is checked against the CRM here. Nothing changes unless the answer is `connected`.
		 */
		async connectOffice(
			officeId: string,
			kind: CrmKind | null,
			token?: string,
		): Promise<"connected" | "no_office" | "token_required" | "no_secrets_key"> {
			if (!(await store.officeExists(officeId))) return "no_office";
			const current = await store.getCrmConnection(officeId);
			const sameKind = (current?.kind ?? null) === kind;
			if (!kind || !crmKindTakesToken(kind)) {
				if (!sameKind) await store.setCrmConnection(officeId, kind);
				return "connected";
			}
			const trimmedToken = token?.trim();
			if (!trimmedToken) return "token_required";
			if (!secretsKey) return "no_secrets_key";
			const sealed = encryptSecret(trimmedToken, secretsKey, crmTokenContext(kind, officeId));
			if (sameKind) await store.replaceCrmAccessToken(officeId, sealed);
			else await store.setCrmConnection(officeId, kind, sealed);
			return "connected";
		},

		/**
		 * A guest wrote on a thread with no lead yet (Q11 to Q13): find the guest's lead in the
		 * office's CRM, or create it, and link the thread. Only the first caller to claim the
		 * thread goes on, so two first messages make one lead. Nothing when the office has no CRM.
		 */
		async newGuest(conversation: Conversation): Promise<void> {
			const connection = await connectionOf(conversation.officeId);
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

		/**
		 * The office's CRM says these leads changed (its webhook, or a reconcile): ask it for their
		 * outcomes and cache them on the office's threads linked to them, observing each new won or
		 * lost outcome at `now` (ADR 0003, Q3). Leads of another office, or a notice `from` a CRM the
		 * office is not on, change nothing.
		 */
		async outcomesChanged(
			officeId: string,
			leadIds: string[],
			now: Date,
			options: { from?: CrmKind } = {},
		): Promise<void> {
			if (leadIds.length === 0) return;
			const connection = await connectionOf(officeId);
			if (!connection) return;
			// A CRM speaks only for the offices connected to it.
			if (options.from && connection.kind !== options.from) return;
			const links = await store.crmLinksForLeads(officeId, leadIds);
			if (links.length === 0) return;
			const reported = await adapterFor(connection, { store, officeId }).outcomesFor(
				links.map((link) => link.leadId),
			);
			for (const link of links) {
				const outcome = reported[link.leadId];
				if (!outcome) continue;
				await store.saveCrmOutcome(
					link.conversationId,
					link.leadId,
					observeOutcome(link, outcome, now),
				);
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
