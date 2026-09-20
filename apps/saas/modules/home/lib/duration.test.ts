import { expect, test } from "vitest";

import { formatDuration } from "./duration";

const MINUTE = 60_000;

test("a response time reads in the unit an operator would say", () => {
	expect(formatDuration(0, "en")).toBe("0 min");
	expect(formatDuration(12 * MINUTE, "en")).toBe("12 min");
	expect(formatDuration(90 * MINUTE, "en")).toBe("1.5 hr");
	expect(formatDuration(30 * 60 * MINUTE, "en")).toBe("30 hr");
	expect(formatDuration(3 * 24 * 60 * MINUTE, "en")).toBe("3 days");
});

test("the unit is spelled for the operator's locale", () => {
	expect(formatDuration(12 * MINUTE, "vi")).toBe("12 phút");
	expect(formatDuration(3 * 24 * 60 * MINUTE, "vi")).toBe("3 ngày");
});
