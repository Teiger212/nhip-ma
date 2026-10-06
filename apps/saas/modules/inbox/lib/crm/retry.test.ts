import { expect, test } from "vitest";

import { hubspotCrmAdapter } from "./hubspot";
import { crmFailureKind, crmRetryDue } from "./retry";
import { CrmError } from "./types";

const MINUTE = 60_000;
const NOW = Date.parse("2026-10-06T12:00:00Z");

/** A thread whose lead write has failed `attempts` times, the last `minutesAgo` minutes before NOW. */
const failed = (attempts: number, minutesAgo: number) => ({
	attempts,
	lastFailedAt: new Date(NOW - minutesAgo * MINUTE).toISOString(),
});

// #211: a thread whose lead write never failed is tried when it is opened.
test("a thread with no failed lead write may be tried at once", () => {
	expect(crmRetryDue(null, NOW)).toBe(true);
});

// #211, on ADR 0023's schedule: the inbox polls every 10 s, and a retry waits 1, 5, 15, then 60
// minutes after each failure, so opening a thread never asks the CRM on every refresh.
test.each([
	[1, 1],
	[2, 5],
	[3, 15],
	[4, 60],
])("after %i failed writes, the next waits %i minutes", (attempts, minutes) => {
	expect(crmRetryDue(failed(attempts, minutes - 0.1), NOW)).toBe(false);
	expect(crmRetryDue(failed(attempts, minutes), NOW)).toBe(true);
});

// #211: retries happen only when someone opens the thread, so they never stop for good; past the
// fourth failure they stay an hour apart.
test("past the fourth failure a retry stays an hour apart, and is never given up", () => {
	expect(crmRetryDue(failed(25, 59), NOW)).toBe(false);
	expect(crmRetryDue(failed(25, 60), NOW)).toBe(true);
});

// #211: a failure stamped by an instance whose clock runs ahead still waits.
test("a failure stamped in the future still waits", () => {
	expect(crmRetryDue(failed(1, -5), NOW)).toBe(false);
});

// #211, the telemetry rule (PDPL): a failure is logged by its kind only.
test("a CRM failure is told apart by kind only: timeout, auth, rejected or other", () => {
	expect(crmFailureKind(new CrmError("no token", "auth"))).toBe("auth");
	expect(crmFailureKind(new DOMException("timed out", "TimeoutError"))).toBe("timeout");
	expect(crmFailureKind(new DOMException("aborted", "AbortError"))).toBe("timeout");
	expect(
		crmFailureKind(new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } })),
	).toBe("timeout");
	expect(crmFailureKind(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }))).toBe(
		"other",
	);
	expect(crmFailureKind(new Error("Thảo +84912345678"))).toBe("other");
	expect(crmFailureKind("a string")).toBe("other");
});

/** HubSpot answering every call with `status`. */
const hubspotAnswering = (status: number) =>
	hubspotCrmAdapter({
		token: "pat-test",
		fetch: async () =>
			new Response(JSON.stringify({ status: "error", category: "SOME_CATEGORY" }), { status }),
	});

// #211: HubSpot's refusals sort into the same kinds.
test.each([
	[401, "auth"],
	[403, "auth"],
	[400, "rejected"],
	[409, "rejected"],
	[408, "timeout"],
	[500, "other"],
	[503, "other"],
])("HubSpot answering %i is a failure of kind %s", async (status, kind) => {
	const error = await hubspotAnswering(status)
		.findLeads({ phone: "+84912345678", zaloUserId: null })
		.then(
			() => null,
			(failure: unknown) => failure,
		);
	expect(error).not.toBeNull();
	expect(crmFailureKind(error)).toBe(kind);
});
