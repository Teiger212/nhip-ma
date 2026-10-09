import { expect, test } from "vitest";

import { formatDateTime, formatInboxTimestamp } from "./time";

const now = Date.parse("2026-09-05T10:00:00.000Z");

test("recent timestamps use localized relative time", () => {
	expect(formatInboxTimestamp("2026-09-05T09:50:00.000Z", "en", now)).toBe("10 minutes ago");
	expect(formatInboxTimestamp("2026-09-05T08:00:00.000Z", "en", now)).toBe("2 hours ago");
	expect(formatInboxTimestamp("2026-09-03T10:00:00.000Z", "en", now)).toBe("2 days ago");
	expect(formatInboxTimestamp("2026-09-05T09:50:00.000Z", "vi", now)).toMatch(/10/);
});

test("past a week, a timestamp is the date and time, as every absolute time is", () => {
	const at = "2026-08-01T03:15:00.000Z";
	expect(formatInboxTimestamp(at, "en", now)).toBe(formatDateTime(at, "en", { nowMs: now }));
});

test("invalid ISO stays as stored text", () => {
	expect(formatInboxTimestamp("not-a-date", "en", now)).toBe("not-a-date");
	expect(formatDateTime("not-a-date", "en", { nowMs: now })).toBe("not-a-date");
});

// rule: #94 "One time format": no year in the current year, the locale's own clock.
test("this year's date drops the year; English reads a 12-hour clock, Vietnamese a 24-hour one", () => {
	const at = "2026-08-01T10:15:00.000Z";
	expect(formatDateTime(at, "en", { nowMs: now, timeZone: "UTC" })).toBe("Aug 1, 10:15 AM");
	expect(formatDateTime("2026-08-01T17:15:00.000Z", "en", { nowMs: now, timeZone: "UTC" })).toBe(
		"Aug 1, 5:15 PM",
	);
	expect(formatDateTime("2026-08-01T17:15:00.000Z", "vi", { nowMs: now, timeZone: "UTC" })).toBe(
		"17:15 1 thg 8",
	);
});

test("another year's date keeps its year", () => {
	expect(formatDateTime("2025-12-30T17:15:00.000Z", "en", { nowMs: now, timeZone: "UTC" })).toBe(
		"Dec 30, 2025, 5:15 PM",
	);
});

test("the year is the one on the clock it is read on: New Year's Eve in UTC is already next year in Hanoi", () => {
	const newYear = Date.parse("2027-01-01T03:00:00.000Z");
	const eve = "2026-12-31T20:00:00.000Z";
	expect(formatDateTime(eve, "en", { nowMs: newYear, timeZone: "Asia/Ho_Chi_Minh" })).toBe(
		"Jan 1, 3:00 AM",
	);
	expect(formatDateTime(eve, "en", { nowMs: newYear, timeZone: "UTC" })).toBe(
		"Dec 31, 2026, 8:00 PM",
	);
});
