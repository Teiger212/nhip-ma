import type { InboxStore } from "@repo/database/inbox";

import type { Runtime } from "../runtime";
import { crmAdapterFor } from "./index";

/** How long a link's outcome, or a phone miss, is trusted before the CRM is asked again. */
export const CRM_TTL_MS = 10 * 60 * 1000;

export type CrmRefresh =
	| { status: "none" }
	| { status: "ok"; checked: number }
	| { status: "failed"; error: string };

/** One refresh per office at a time, per store: concurrent polls and Home share it. */
const inFlight = new WeakMap<InboxStore, Map<string, Promise<CrmRefresh>>>();

/**
 * Fetch on view (ADR 0003, decided 2026-09-27): links unlinked threads by phone and
 * re-reads outcomes the cache no longer trusts. Only work older than `CRM_TTL_MS` reaches
 * the CRM, so the 10-second inbox poll costs nothing most of the time. A failure keeps
 * every cached outcome, is logged, and makes the office wait out the TTL before the CRM
 * is asked again; it is reported, never thrown.
 */
export function refreshCrm(
	runtime: Runtime,
	officeId: string,
	now: number = Date.now(),
): Promise<CrmRefresh> {
	const running = inFlight.get(runtime.store) ?? new Map<string, Promise<CrmRefresh>>();
	inFlight.set(runtime.store, running);
	const current = running.get(officeId);
	if (current) return current;
	const run = refreshOnce(runtime, officeId, now).finally(() => running.delete(officeId));
	running.set(officeId, run);
	return run;
}

async function refreshOnce(runtime: Runtime, officeId: string, now: number): Promise<CrmRefresh> {
	const connection = await runtime.store.getCrmConnection(officeId);
	if (!connection) return { status: "none" };
	if (connection.failedAt && now - new Date(connection.failedAt).getTime() < CRM_TTL_MS) {
		return { status: "failed", error: "waiting after a CRM failure" };
	}
	const adapter = (runtime.crm ?? crmAdapterFor)(connection, { store: runtime.store, officeId });
	const checkedAt = new Date(now);
	try {
		const work = await runtime.store.crmWork(officeId, new Date(now - CRM_TTL_MS));
		const toRead: Array<{ conversationId: string; leadId: string }> = [];
		for (const item of work) {
			// Every write below is conditional on the link still being what was read, so an
			// agent who links or unlinks while the CRM is being asked always wins.
			const expected = item.crm ? { leadId: item.crm.leadId, checkedAt: item.crm.checkedAt } : null;
			if (item.crm?.method === "manual" && !item.crm.leadId) {
				// Unlinked by an agent: nothing to read, and phone matching must not undo it.
				await runtime.store.saveCrmLink(
					item.conversationId,
					{ kind: item.crm.kind, leadId: null, leadName: null, method: "manual", checkedAt },
					expected,
				);
				continue;
			}
			if (item.crm?.leadId) {
				toRead.push({ conversationId: item.conversationId, leadId: item.crm.leadId });
				continue;
			}
			const lead = await adapter.findLeadForConversation(item);
			const saved = await runtime.store.saveCrmLink(
				item.conversationId,
				{
					kind: connection.kind,
					leadId: lead?.id ?? null,
					leadName: lead?.name ?? null,
					method: "phone",
					checkedAt,
				},
				expected,
			);
			if (saved && lead) toRead.push({ conversationId: item.conversationId, leadId: lead.id });
		}
		if (toRead.length > 0) {
			const outcomes = await adapter.outcomesFor([...new Set(toRead.map((item) => item.leadId))]);
			// A lead the CRM no longer returns loses its outcome; its check time still moves.
			await runtime.store.saveCrmOutcomes(
				toRead.map(({ conversationId, leadId }) => {
					const outcome = outcomes[leadId];
					return {
						conversationId,
						leadId,
						outcome: outcome?.status ?? null,
						outcomeAt: outcome?.at ? new Date(outcome.at) : null,
						outcomeReason: outcome?.reason ?? null,
					};
				}),
				checkedAt,
			);
		}
		if (connection.failedAt) await runtime.store.markCrmFailure(officeId, null);
		return { status: "ok", checked: work.length };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn("crm refresh failed", { officeId, kind: connection.kind, error: message });
		await runtime.store.markCrmFailure(officeId, checkedAt);
		return { status: "failed", error: message };
	}
}
