import { readMockCrmWebhook } from "@inbox/lib/crm/mock-webhook";
import { createCrmSync } from "@inbox/lib/crm/sync";
import { threadUrl } from "@inbox/lib/inbox";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The mock CRM tells Nhịp its leads changed (ADR 0003, spec #59), the way HubSpot's webhook
 * will: Nhịp then asks the CRM for their outcomes. Only a deployment that sets
 * MOCK_CRM_WEBHOOK_SECRET has it (development and E2E); elsewhere it does not exist.
 */
export async function POST(request: Request): Promise<Response> {
	const runtime = getRuntime();
	const secret = runtime.config.mockCrmWebhookSecret;
	if (!secret) return NextResponse.json({ error: "not_found" }, { status: 404 });
	const notice = readMockCrmWebhook(
		await request.text(),
		request.headers.get("x-mock-crm-signature"),
		secret,
	);
	if (!notice) return NextResponse.json({ error: "bad_signature" }, { status: 401 });
	await createCrmSync({ store: runtime.store, threadUrl }).outcomesChanged(
		notice.officeId,
		notice.leadIds,
		new Date(),
	);
	return NextResponse.json({ ok: true });
}
