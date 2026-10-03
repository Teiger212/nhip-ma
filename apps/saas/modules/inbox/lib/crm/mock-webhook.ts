import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const Notice = z.object({ officeId: z.string().min(1), leadIds: z.array(z.string().min(1)) });

/**
 * The mock CRM's outcome notice (ADR 0003), read only when its `x-mock-crm-signature`
 * (`sha256=<hex HMAC-SHA256 of the raw body>`) holds under the deployment's secret, as HubSpot
 * signs its webhooks. Anything else is null: nothing unsigned is trusted.
 */
export function readMockCrmWebhook(
	rawBody: string,
	signature: string | null,
	secret: string,
): z.infer<typeof Notice> | null {
	const given = signature?.startsWith("sha256=") ? Buffer.from(signature.slice(7), "hex") : null;
	const expected = createHmac("sha256", secret).update(rawBody).digest();
	if (!given || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const parsed = Notice.safeParse(JSON.parse(rawBody));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
