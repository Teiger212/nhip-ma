import type { InboxStore } from "@repo/database/inbox";

import { displayName } from "../display-name";
import { crmTokenContext, decryptSecret, encryptSecret } from "../pipes/secrets";
import type { Conversation, CrmKind } from "../types";
import {
	type CrmAdapterConnection,
	crmAdapterFor,
	crmKindHasAccount,
	crmKindTakesToken,
} from "./adapters";
import { guestIdentity } from "./phone";
import { decideLead, observeOutcome } from "./rules";
import type { CrmAdapter, CrmNotice } from "./types";

/**
 * How many offices on a CRM, their account not known yet, one notice from an unknown account
 * asks the CRM about: the CRM waits on the answer, and may give up after a few seconds.
 */
const MAX_ACCOUNT_LOOKUPS = 5;

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

	/**
	 * The office's CRM, with its access token opened for the adapter and the sealed token it was
	 * opened from; null when it has none.
	 */
	async function connectionOf(
		officeId: string,
	): Promise<{ connection: CrmAdapterConnection; sealed: string | null } | null> {
		const connection = await store.getCrmConnection(officeId);
		if (!connection) return null;
		if (!crmKindTakesToken(connection.kind)) {
			return { connection: { kind: connection.kind, token: null }, sealed: null };
		}
		const sealed = await store.getCrmAccessToken(officeId);
		const token =
			sealed && secretsKey
				? decryptSecret(sealed, secretsKey, crmTokenContext(connection.kind, officeId))
				: null;
		return { connection: { kind: connection.kind, token }, sealed };
	}

	/**
	 * Ask the office's CRM which account its connection reaches, and remember it (#66); nothing
	 * for a CRM whose webhook names the office itself. Throws what the CRM refused.
	 */
	async function resolveAccount(officeId: string): Promise<void> {
		const opened = await connectionOf(officeId);
		if (!opened || !crmKindHasAccount(opened.connection.kind)) return;
		const accountId = await adapterFor(opened.connection, { store, officeId }).accountId();
		// Written only if the connection is still the one asked about (a new token clears it).
		await store.setCrmAccountId(
			officeId,
			{ kind: opened.connection.kind, accessToken: opened.sealed },
			accountId,
		);
	}

	/**
	 * The offices on the CRM `kind` whose account is `account`. When none is, the few offices on
	 * it whose account is not known yet are asked first, once per webhook: its first unknown
	 * account starts `pendingAccountLookup`, and every later one waits on that same lookup.
	 */
	async function officesOnAccount(
		kind: CrmKind,
		account: string,
		pendingAccountLookup: { done?: Promise<void> },
	): Promise<string[]> {
		if (!crmKindHasAccount(kind)) return [account];
		const known = await store.crmOfficesOnAccount(kind, account);
		if (known.length > 0) return known;
		pendingAccountLookup.done ??= (async () => {
			const unknown = await store.crmOfficesWithoutAccount(kind, MAX_ACCOUNT_LOOKUPS);
			await Promise.all(
				unknown.map((officeId) =>
					resolveAccount(officeId).catch((error: unknown) => {
						// The CRM's error names its operation, status and category only (story 43).
						console.warn("crm: account lookup failed", {
							officeId,
							reason: error instanceof Error ? error.message : "unknown",
						});
					}),
				),
			);
		})();
		await pendingAccountLookup.done;
		return store.crmOfficesOnAccount(kind, account);
	}

	const sync = {
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
			const connection = (await connectionOf(conversation.officeId))?.connection;
			if (!connection) return;
			if (!(await store.claimCrmLink(conversation.id, conversation.officeId))) return;
			try {
				await linkLead(
					conversation,
					adapterFor(connection, { store, officeId: conversation.officeId }),
				);
			} catch (error) {
				// A failed write never blocks the thread: the guest's next message tries again.
				await store.releaseCrmLink(conversation.officeId, conversation.id);
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
			const connection = (await connectionOf(officeId))?.connection;
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
					officeId,
					link.conversationId,
					link.leadId,
					observeOutcome(link, outcome, now),
				);
			}
		},

		/**
		 * A CRM's verified webhook (#66): each notice names the CRM's account and its changed
		 * leads, and goes to the offices on that account, only them (ADR 0008). An account no
		 * office is on is ignored.
		 */
		async noticesReceived(kind: CrmKind, notices: CrmNotice[], now: Date): Promise<void> {
			const pendingAccountLookup = {};
			for (const notice of notices) {
				for (const officeId of await officesOnAccount(kind, notice.account, pendingAccountLookup)) {
					await sync.outcomesChanged(officeId, notice.leadIds, now, { from: kind });
				}
			}
		},

		/**
		 * Learn which account of its CRM the office's connection reaches (#66), right after its
		 * token is saved; a webhook from an account no office is known on asks again.
		 */
		resolveAccount,
	};

	return sync;

	async function linkLead(conversation: Conversation, crm: CrmAdapter): Promise<void> {
		const identity = guestIdentity(conversation);
		const matches = identity.phone || identity.zaloUserId ? await crm.findLeads(identity) : [];
		const decision = decideLead(matches, identity);
		if (decision.action === "ambiguous") {
			await store.releaseCrmLink(conversation.officeId, conversation.id);
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
		await store.completeCrmLink(conversation.officeId, conversation.id, {
			leadId: lead.id,
			leadName: lead.name,
			method: decision.method,
		});
	}
}
