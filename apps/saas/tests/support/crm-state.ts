/**
 * The mock CRM as a test sees it (run in the state process, state-process.ts, for `crm.ts`). The
 * mock CRM is the office's CRM for E2E: connecting an office to it is setup, and reading its
 * leads is looking at the CRM, as a manager would in HubSpot. `connectOfficeToMockCrm` writes
 * the connection straight to the store, which drops the office's links to leads: use it on a
 * fresh office only.
 */
import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

/** The office's CRM is the mock CRM. */
export async function connectOfficeToMockCrm(officeId: string): Promise<void> {
	await createInboxStore(db).setCrmConnection(officeId, "mock");
}

/** The CRM marks the lead (its own record, as an office would). */
export async function markMockCrmLead(
	officeId: string,
	leadId: string,
	status: string,
): Promise<void> {
	if (status !== "open" && status !== "won" && status !== "lost") {
		throw new Error(`outcome <officeId> <leadId> <open|won|lost>, not ${status}`);
	}
	await createInboxStore(db).setMockCrmLeadOutcome(officeId, leadId, {
		status,
		at: status === "open" ? null : new Date(),
		reason: status === "lost" ? "E2E: the CRM marked it lost" : null,
	});
}

/** The office's mock leads, as the store reads them, afresh on every call. */
export function mockCrmLeadsOf(officeId: string) {
	return createInboxStore(db).findMockCrmLeads(officeId);
}

/**
 * The mock CRM goes down for the office, or comes back (#211): while it is down, every call Nhịp
 * makes to it fails, as a real CRM's does when it can't be reached.
 */
export async function setMockCrmDown(officeId: string, state: string): Promise<void> {
	if (state !== "down" && state !== "up") {
		throw new Error(`availability <officeId> <down|up>, not ${state}`);
	}
	if (state === "down") {
		await db.mockCrmOutage.upsert({ where: { officeId }, create: { officeId }, update: {} });
	} else {
		await db.mockCrmOutage.deleteMany({ where: { officeId } });
	}
}

/**
 * Time passes for the office's failed CRM writes (#211): each one's wait before it may be tried
 * again is over, as if it had failed a day ago.
 */
export async function passCrmRetryWait(officeId: string): Promise<void> {
	await db.crmWriteFailure.updateMany({
		where: { officeId },
		data: { lastFailedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
	});
}
