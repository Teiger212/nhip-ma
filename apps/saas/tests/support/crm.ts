import { createHmac } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

import { askState } from "./state-client";

/** A lead in the mock CRM, as a manager would see it in the CRM itself. */
export type MockCrmLead = {
	id: string;
	name: string;
	/** E.164, or null. */
	phone: string | null;
	zaloUserId: string | null;
	pipe: "zalo" | "whatsapp";
	language: string | null;
	fields: Record<string, unknown> | null;
	threadUrl: string;
	outcome: "open" | "won" | "lost";
};

/** Setup only (see crm-state.ts): the office's CRM is the mock CRM. */
export async function connectMockCrm(officeId: string): Promise<void> {
	await askState("crm.connect", officeId);
}

/**
 * The office's mock CRM goes down (#211): until `bringMockCrmBack`, every call Nhịp makes to it
 * fails, as a real CRM's does when it can't be reached. Its leads are kept.
 */
export async function takeMockCrmDown(officeId: string): Promise<void> {
	await askState("crm.availability", officeId, "down");
}

/** The office's mock CRM works again (#211). */
export async function bringMockCrmBack(officeId: string): Promise<void> {
	await askState("crm.availability", officeId, "up");
}

/**
 * Time passes for the office's failed CRM writes (#211): Nhịp waits a while after a failed lead
 * write before it tries again, and this makes that wait over for every thread of the office, as
 * if the write had failed a day ago. Nothing is retried by this alone.
 */
export async function passCrmRetryWait(officeId: string): Promise<void> {
	await askState("crm.retry-wait-passes", officeId);
}

/**
 * The office marks a lead in the mock CRM, and the CRM tells Nhịp, as HubSpot would: a webhook
 * naming the changed lead, signed with the deployment's MOCK_CRM_WEBHOOK_SECRET (.env.e2e).
 * Answers the webhook's HTTP status. Nothing here writes Nhịp's own link to the lead.
 */
export async function markInMockCrm(
	request: APIRequestContext,
	officeId: string,
	leadId: string,
	outcome: "open" | "won" | "lost",
): Promise<number> {
	await askState("crm.outcome", officeId, leadId, outcome);
	const secret = process.env.MOCK_CRM_WEBHOOK_SECRET;
	if (!secret) throw new Error("MOCK_CRM_WEBHOOK_SECRET comes from the E2E env");
	const body = JSON.stringify({ officeId, leadIds: [leadId] });
	const signature = createHmac("sha256", secret).update(body).digest("hex");
	const res = await request.post("/webhooks/crm/mock", {
		data: body,
		headers: { "content-type": "application/json", "x-mock-crm-signature": `sha256=${signature}` },
	});
	return res.status();
}

/** Every lead the office has in the mock CRM, oldest first, read afresh on every call. */
export function mockCrmLeads(officeId: string): Promise<MockCrmLead[]> {
	return askState<MockCrmLead[]>("crm.leads", officeId);
}
