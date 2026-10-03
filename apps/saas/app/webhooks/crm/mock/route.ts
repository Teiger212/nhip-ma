import { handleCrmWebhook } from "@inbox/lib/crm/webhook";

export const dynamic = "force-dynamic";

/** The mock CRM's outcome webhook (development and E2E only; see `crmWebhookFor`). */
export function POST(request: Request): Promise<Response> {
	return handleCrmWebhook("mock", request);
}
