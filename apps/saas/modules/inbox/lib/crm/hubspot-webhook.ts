import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { CrmNotice } from "./types";

/**
 * HubSpot's outcome webhook (ADR 0003, #66), read only when its v3 signature holds:
 * base64(HMAC-SHA256(the app's client secret, method + URI + raw body + timestamp)), the
 * timestamp no more than 5 minutes off. The URI is the webhook URL configured in the app
 * (`HUBSPOT_WEBHOOK_URL`), not `request.url`, which behind a tunnel or proxy is not what HubSpot
 * called. One app serves many portals, so each notice names the portal, never an office.
 * https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation
 */

/** HubSpot's limit on a request's age; a newer timestamp is held to the same skew. */
const MAX_SKEW_MS = 5 * 60 * 1000;
/** HubSpot's object type id for deals. */
const DEAL_OBJECT_TYPE = "0-3";
/** The deal property whose change can mean won or lost. */
const STAGE_PROPERTY = "dealstage";

/** The `%xx` HubSpot decodes in the signed URI's query before signing. */
const DECODED: Record<string, string> = {
	"%3A": ":",
	"%2F": "/",
	"%3F": "?",
	"%40": "@",
	"%21": "!",
	"%24": "$",
	"%27": "'",
	"%28": "(",
	"%29": ")",
	"%2A": "*",
	"%2C": ",",
	"%3B": ";",
};

const Id = z.union([z.number(), z.string().min(1)]).transform(String);
/** One event of the batch: the parts that say which deal's stage changed, on which portal. */
const Event = z.object({
	portalId: Id,
	objectId: Id,
	subscriptionType: z.string(),
	objectTypeId: z.string().optional(),
	propertyName: z.string().optional(),
});

export type HubSpotWebhookSettings = {
	/** The app's client secret, which signs its webhooks. */
	clientSecret: string;
	/** The public URL HubSpot calls, exactly as the app's `targetUrl`. */
	url: string;
};

/**
 * The portals and deals whose stage changed, from a verified batch (none when nothing in it is
 * a stage change); null when the request is not verified. `now` is the clock it is checked at.
 */
export function readHubSpotWebhook(
	request: { method: string; rawBody: string; headers: Headers },
	settings: HubSpotWebhookSettings,
	now: Date,
): CrmNotice[] | null {
	const signature = request.headers.get("x-hubspot-signature-v3");
	const timestamp = request.headers.get("x-hubspot-request-timestamp");
	if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return null;
	if (Math.abs(now.getTime() - Number(timestamp)) > MAX_SKEW_MS) return null;
	const signed = `${request.method}${signedUri(settings.url)}${request.rawBody}${timestamp}`;
	const expected = createHmac("sha256", settings.clientSecret).update(signed, "utf8").digest();
	const given = Buffer.from(signature, "base64");
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	return stageChanges(request.rawBody);
}

/** The URI as HubSpot signs it: no fragment, and the listed characters of its query decoded. */
function signedUri(url: string): string {
	const uri = url.split("#")[0];
	const query = uri.indexOf("?");
	if (query === -1) return uri;
	return (
		uri.slice(0, query + 1) +
		uri
			.slice(query + 1)
			.replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/g, (match) => DECODED[match])
	);
}

/**
 * The batch's deal-stage changes, grouped by portal, each deal once. A signed batch that is not
 * a list, and events that are not a deal's stage, are ignored rather than refused: HubSpot would
 * retry a refusal.
 */
function stageChanges(rawBody: string): CrmNotice[] {
	let events: unknown;
	try {
		events = JSON.parse(rawBody);
	} catch {
		return [];
	}
	if (!Array.isArray(events)) return [];
	const byPortal = new Map<string, Set<string>>();
	for (const candidate of events) {
		const event = Event.safeParse(candidate);
		if (!event.success || !isStageChange(event.data)) continue;
		const deals = byPortal.get(event.data.portalId) ?? new Set<string>();
		deals.add(event.data.objectId);
		byPortal.set(event.data.portalId, deals);
	}
	return [...byPortal].map(([account, deals]) => ({ account, leadIds: [...deals] }));
}

/** A deal's stage changed: the `object.propertyChange` format, or the classic `deal.propertyChange`. */
function isStageChange(event: z.infer<typeof Event>): boolean {
	if (event.propertyName !== STAGE_PROPERTY) return false;
	if (event.subscriptionType === "object.propertyChange") {
		return event.objectTypeId === DEAL_OBJECT_TYPE;
	}
	return event.subscriptionType === "deal.propertyChange";
}
