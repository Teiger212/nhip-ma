import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";

import type { APIRequestContext } from "@playwright/test";

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
export function connectMockCrm(officeId: string): void {
	run(["connect", officeId], "inherit");
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
	run(["outcome", officeId, leadId, outcome], "inherit");
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

/** Every lead the office has in the mock CRM, oldest first. */
export function mockCrmLeads(officeId: string): MockCrmLead[] {
	return JSON.parse(run(["leads", officeId], "pipe")) as MockCrmLead[];
}

function run(args: string[], stdout: "inherit" | "pipe"): string {
	const out = execFileSync(
		"pnpm",
		["exec", "tsx", "--tsconfig", "tsconfig.json", "tests/support/crm-state.ts", ...args],
		{
			cwd: path.resolve(__dirname, "../.."),
			stdio: ["ignore", stdout, "inherit"],
			encoding: "utf8",
		},
	);
	return out ?? "";
}
