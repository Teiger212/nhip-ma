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
