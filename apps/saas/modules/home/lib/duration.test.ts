import { expect, test } from "vitest";

import { durationParts, formatDuration } from "./duration";

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

test("a figure splits into its number and its unit, so the digits can be set apart", () => {
	expect(durationParts(12 * MINUTE, "en")).toEqual([
		{ value: "12", number: true },
		{ value: " min", number: false },
	]);
	expect(durationParts(90 * MINUTE, "vi")).toEqual([
		{ value: "1,5", number: true },
		{ value: " giờ", number: false },
	]);
	expect(
		durationParts(3 * 24 * 60 * MINUTE, "en")
			.map((part) => part.value)
			.join(""),
	).toBe(formatDuration(3 * 24 * 60 * MINUTE, "en"));
});
