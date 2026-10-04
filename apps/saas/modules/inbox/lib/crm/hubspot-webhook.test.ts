import { createHmac } from "node:crypto";

import { expect, test } from "vitest";

import { readHubSpotWebhook } from "./hubspot-webhook";

/**
 * HubSpot's outcome webhook (#66, ADR 0003): read only when its v3 signature holds. Signatures
 * here are computed from HubSpot's documented formula, independently of the code under test
 * (https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation):
 * base64(HMAC-SHA256(client secret, method + URI + raw body + X-HubSpot-Request-Timestamp)).
 */

const SECRET = "test-only-hubspot-client-secret";
const WEBHOOK_URL = "https://nhip.example/webhooks/crm/hubspot";
const SENT_AT = 1_790_000_000_000;
const settings = { clientSecret: SECRET, url: WEBHOOK_URL };

function v3(raw: string, { secret = SECRET, uri = WEBHOOK_URL, timestamp = SENT_AT } = {}) {
	return createHmac("sha256", secret).update(`POST${uri}${raw}${timestamp}`).digest("base64");
}

function delivery(raw: string, headers: Record<string, string | null> = {}) {
	const all: Record<string, string | null> = {
		"x-hubspot-signature-v3": v3(raw),
		"x-hubspot-request-timestamp": String(SENT_AT),
		...headers,
	};
	const kept = Object.entries(all).filter((entry): entry is [string, string] => entry[1] !== null);
	return { method: "POST", rawBody: raw, headers: new Headers(kept) };
}

const at = (ms: number) => new Date(SENT_AT + ms);

/** A deal's stage changed, as a `crmObjects` `object.propertyChange` subscription reports it. */
function stageChange(portalId: number, dealId: number, extra: Record<string, unknown> = {}) {
	return {
		eventId: dealId * 7,
		subscriptionId: 4242,
		portalId,
		appId: 777,
		occurredAt: SENT_AT - 2000,
		subscriptionType: "object.propertyChange",
		attemptNumber: 0,
		objectId: dealId,
		objectTypeId: "0-3",
		propertyName: "dealstage",
		propertyValue: "closedwon",
		changeSource: "CRM_UI",
		sourceId: "userId:1",
		...extra,
	};
}

const oneStageChange = JSON.stringify([stageChange(111, 9001)]);

// HubSpot's own v3 example (Java tab of the request-validation page): its secret, URI, body,
// timestamp and signature. A contact was created, so it is verified and carries no deal stage.
test("HubSpot's documented v3 example is verified", () => {
	const body =
		'[{"eventId":531833541,"subscriptionId":3923621,"portalId":48807704,"appId":16111050,"occurredAt":1752613920733,"subscriptionType":"contact.creation","attemptNumber":0,"objectId":138017612137,"changeFlag":"CREATED","changeSource":"CRM_UI","sourceId":"userId:76023669"}]';
	const request = {
		method: "POST",
		rawBody: body,
		headers: new Headers({
			"x-hubspot-signature-v3": "gbj1XPRvUt0noT7i7fXfTzOD4sLzQmf0VT28ZYq0EYg=",
			"x-hubspot-request-timestamp": "1752613922216",
		}),
	};
	expect(
		readHubSpotWebhook(
			request,
			{
				clientSecret: "cfc68c0b-4b4e-4ef8-b764-95350e4ea479",
				url: "https://webhook.site/335453f5-94b3-49d9-b684-a55354d4b8df",
			},
			new Date(1752613922216 + 1000),
		),
	).toEqual([]);
});

// ADR 0003, #66: a deal moved to another stage, signed with the app's client secret, is read.
test("a validly signed stage change names the portal and the deal", () => {
	expect(readHubSpotWebhook(delivery(oneStageChange), settings, at(1000))).toEqual([
		{ account: "111", leadIds: ["9001"] },
	]);
});

// HubSpot's rule: the signed URI has the listed %xx characters of its query decoded.
test("the signed URI is the configured webhook URL with its query decoded as HubSpot does", () => {
	const url = `${WEBHOOK_URL}?install=a%3Ab%2Cc`;
	const raw = oneStageChange;
	const request = delivery(raw, {
		"x-hubspot-signature-v3": v3(raw, { uri: `${WEBHOOK_URL}?install=a:b,c` }),
	});
	expect(readHubSpotWebhook(request, { clientSecret: SECRET, url }, at(1000))).toEqual([
		{ account: "111", leadIds: ["9001"] },
	]);
});

// ADR 0003: nothing unsigned is trusted; a wrong secret, a changed body or another URI is refused.
test("a bad signature is refused", () => {
	const raw = oneStageChange;
	const now = at(1000);
	expect(
		readHubSpotWebhook(
			delivery(raw, { "x-hubspot-signature-v3": v3(raw, { secret: "another-secret" }) }),
			settings,
			now,
		),
	).toBeNull();
	expect(
		readHubSpotWebhook({ ...delivery(raw), rawBody: raw.replace("9001", "9002") }, settings, now),
	).toBeNull();
	expect(
		readHubSpotWebhook(
			delivery(raw, {
				"x-hubspot-signature-v3": v3(raw, { uri: "https://elsewhere.example/hook" }),
			}),
			settings,
			now,
		),
	).toBeNull();
	expect(
		readHubSpotWebhook(
			delivery(raw, { "x-hubspot-signature-v3": "not-a-signature" }),
			settings,
			now,
		),
	).toBeNull();
});

// HubSpot's rule: reject the request if the timestamp is older than 5 minutes (a replay).
test("a stale timestamp is refused", () => {
	const fiveMinutes = 5 * 60 * 1000;
	expect(readHubSpotWebhook(delivery(oneStageChange), settings, at(fiveMinutes))).not.toBeNull();
	expect(readHubSpotWebhook(delivery(oneStageChange), settings, at(fiveMinutes + 1))).toBeNull();
});

// HubSpot's rule: the v3 signature and its timestamp are both needed to verify a request.
test("a missing signature or timestamp header is refused", () => {
	const now = at(1000);
	expect(
		readHubSpotWebhook(delivery(oneStageChange, { "x-hubspot-signature-v3": null }), settings, now),
	).toBeNull();
	expect(
		readHubSpotWebhook(
			delivery(oneStageChange, { "x-hubspot-request-timestamp": null }),
			settings,
			now,
		),
	).toBeNull();
	expect(
		readHubSpotWebhook(
			delivery(oneStageChange, { "x-hubspot-request-timestamp": "yesterday" }),
			settings,
			now,
		),
	).toBeNull();
});

// #66: one app serves many portals; each portal's changed deals are told apart, once each.
test("a batch is grouped by portal into the account and its changed deals", () => {
	const raw = JSON.stringify([
		stageChange(111, 9001),
		stageChange(222, 9100),
		stageChange(111, 9002, { propertyValue: "closedlost" }),
		stageChange(111, 9001, { attemptNumber: 1 }),
	]);
	expect(readHubSpotWebhook(delivery(raw), settings, at(1000))).toEqual([
		{ account: "111", leadIds: ["9001", "9002"] },
		{ account: "222", leadIds: ["9100"] },
	]);
});

// #66: only a deal's stage tells Nhịp about an outcome; anything else in the batch is ignored.
test("events that are not a deal's stage changing are ignored", () => {
	const raw = JSON.stringify([
		stageChange(111, 9001, { propertyName: "amount", propertyValue: "5000" }),
		stageChange(111, 9002, { subscriptionType: "object.creation", propertyName: undefined }),
		stageChange(111, 9003, { objectTypeId: "0-1" }),
		{ portalId: 111, objectId: 9004, subscriptionType: "deal.deletion", occurredAt: SENT_AT },
		{ unexpected: "shape" },
		stageChange(333, 9005),
	]);
	expect(readHubSpotWebhook(delivery(raw), settings, at(1000))).toEqual([
		{ account: "333", leadIds: ["9005"] },
	]);
	const nothing = JSON.stringify([stageChange(111, 9001, { propertyName: "amount" })]);
	expect(readHubSpotWebhook(delivery(nothing), settings, at(1000))).toEqual([]);
});
