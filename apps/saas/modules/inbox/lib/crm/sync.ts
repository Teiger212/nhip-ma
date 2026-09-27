import type { Runtime } from "../runtime";
import { crmAdapterFor } from "./index";

/** How long a link's outcome, or a phone miss, is trusted before the CRM is asked again. */
export const CRM_TTL_MS = 10 * 60 * 1000;

export type CrmRefresh =
	| { status: "none" }
	| { status: "ok"; checked: number }
	| { status: "failed"; error: string };

/**
 * Fetch on view (ADR 0003, decided 2026-09-27): links unlinked threads by phone and
 * re-reads outcomes the cache no longer trusts. Only work older than `CRM_TTL_MS` reaches
 * the CRM, so the 10-second inbox poll costs nothing most of the time. A failure keeps
 * every cached outcome and is reported, never thrown.
 */
export async function refreshCrm(
	runtime: Runtime,
	officeId: string,
	now: number = Date.now(),
): Promise<CrmRefresh> {
	const connection = await runtime.store.getCrmConnection(officeId);
	if (!connection) return { status: "none" };
	const adapter = (runtime.crm ?? crmAdapterFor)(connection, { store: runtime.store, officeId });
	const checkedAt = new Date(now);
	try {
		const work = await runtime.store.crmWork(officeId, new Date(now - CRM_TTL_MS));
		const toRead: Array<{ conversationId: string; leadId: string }> = [];
		for (const item of work) {
			if (item.crm?.method === "manual" && !item.crm.leadId) {
				// Unlinked by an agent: nothing to read, and phone matching must not undo it.
				await runtime.store.saveCrmLink(item.conversationId, {
					kind: item.crm.kind,
					leadId: null,
					leadName: null,
					method: "manual",
					checkedAt,
				});
				continue;
			}
			if (item.crm?.leadId) {
				toRead.push({ conversationId: item.conversationId, leadId: item.crm.leadId });
				continue;
			}
			const lead = await adapter.findLeadForConversation(item);
			await runtime.store.saveCrmLink(item.conversationId, {
				kind: connection.kind,
				leadId: lead?.id ?? null,
				leadName: lead?.name ?? null,
				method: "phone",
				checkedAt,
			});
			if (lead) toRead.push({ conversationId: item.conversationId, leadId: lead.id });
		}
		if (toRead.length > 0) {
			const outcomes = await adapter.outcomesFor([...new Set(toRead.map((item) => item.leadId))]);
			// A lead the CRM no longer returns loses its outcome; its check time still moves.
			await runtime.store.saveCrmOutcomes(
				toRead.map(({ conversationId, leadId }) => {
					const outcome = outcomes[leadId];
					return {
						conversationId,
						outcome: outcome?.status ?? null,
						outcomeAt: outcome?.at ? new Date(outcome.at) : null,
						outcomeReason: outcome?.reason ?? null,
					};
				}),
				checkedAt,
			);
		}
		return { status: "ok", checked: work.length };
	} catch (error) {
		return { status: "failed", error: error instanceof Error ? error.message : String(error) };
	}
}
