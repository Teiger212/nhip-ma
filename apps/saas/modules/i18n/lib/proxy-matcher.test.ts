import { describe, expect, it } from "vitest";

import { PROXY_MATCHER_SOURCE } from "./proxy-matcher";

function matcherRegExp(): RegExp {
	return new RegExp(`^${PROXY_MATCHER_SOURCE}$`);
}

describe("proxy matcher", () => {
	const matcher = matcherRegExp();

	it.each([
		["/", true],
		["/inbox", true],
		["/en/inbox", true],
		["/devtools", true],
		["/dev/inbound", false],
		["/api/conversations", false],
		["/webhooks/zalo", false],
		["/_next/static/x.js", false],
		["/favicon.ico", false],
	])("proxies %s -> %s", (path, expected) => {
		expect(matcher.test(path)).toBe(expected);
	});
});
