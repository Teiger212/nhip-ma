import { handleCrmWebhook } from "@inbox/lib/crm/webhook";

export const dynamic = "force-dynamic";

/** HubSpot's outcome webhook (#66): deal stage changes, signed v3; see `crmWebhookFor`. */
export function POST(request: Request): Promise<Response> {
	return handleCrmWebhook("hubspot", request);
}
