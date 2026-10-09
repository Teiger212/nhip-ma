import { expect, test } from "vitest";

import { type DurationUnits, durationParts, formatDuration } from "./duration";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The units as `home.units` spells them in each language. */
const EN: DurationUnits = { day: "d", hour: "h", minute: "min" };
const VI: DurationUnits = { day: "ngày", hour: "giờ", minute: "phút" };

// rule: #94 "One time format": waits read "1 d 16 h", never "40.2 hr".
test("a duration reads in the two largest whole units an operator would say", () => {
	expect(formatDuration(0, EN)).toBe("0 min");
	expect(formatDuration(12 * MINUTE, EN)).toBe("12 min");
	expect(formatDuration(90 * MINUTE, EN)).toBe("1 h 30 min");
	expect(formatDuration(2 * HOUR, EN)).toBe("2 h");
	expect(formatDuration(40.2 * HOUR, EN)).toBe("1 d 16 h");
	expect(formatDuration(3 * DAY, EN)).toBe("3 d");
	expect(formatDuration(3 * DAY + 59 * MINUTE, EN)).toBe("3 d");
});

test("it is spelled in the operator's language", () => {
	expect(formatDuration(12 * MINUTE, VI)).toBe("12 phút");
	expect(formatDuration(44.4 * HOUR, VI)).toBe("1 ngày 20 giờ");
});

test("a figure splits into its numbers and its units, so the digits can be set apart", () => {
	expect(durationParts(12 * MINUTE, EN)).toEqual([
		{ value: "12", number: true },
		{ value: " min", number: false },
	]);
	expect(durationParts(40 * HOUR, VI)).toEqual([
		{ value: "1", number: true },
		{ value: " ngày ", number: false },
		{ value: "16", number: true },
		{ value: " giờ", number: false },
	]);
});
