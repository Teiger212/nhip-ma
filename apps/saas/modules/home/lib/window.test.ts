import { expect, test } from "vitest";

import { windowStart } from "./window";

/**
 * ADR 0002: Home counts over a fixed window of whole days, and the days are the office's
 * local calendar days, so "the last 30 days" starts at local midnight 29 days before today.
 */

test("ADR 0002's window starts at the office's local midnight, in Ho Chi Minh City", () => {
	// 10:00 on 2 October in Ho Chi Minh City (UTC+7): the window opens at 00:00 on 3 September.
	expect(windowStart(new Date("2026-10-02T03:00:00Z"), 30, "Asia/Ho_Chi_Minh").toISOString()).toBe(
		"2026-09-02T17:00:00.000Z",
	);
	// 01:00 on 2 October locally is still 1 October in UTC; the office's day is what counts.
	expect(windowStart(new Date("2026-10-01T18:00:00Z"), 30, "Asia/Ho_Chi_Minh").toISOString()).toBe(
		"2026-09-02T17:00:00.000Z",
	);
	// A one-day window is today since local midnight.
	expect(windowStart(new Date("2026-10-02T03:00:00Z"), 1, "Asia/Ho_Chi_Minh").toISOString()).toBe(
		"2026-10-01T17:00:00.000Z",
	);
});

test("ADR 0002's window in UTC is UTC midnight 29 days back", () => {
	expect(windowStart(new Date("2026-10-02T23:59:59Z"), 30, "UTC").toISOString()).toBe(
		"2026-09-03T00:00:00.000Z",
	);
	expect(windowStart(new Date("2026-10-02T00:00:00Z"), 30, "UTC").toISOString()).toBe(
		"2026-09-03T00:00:00.000Z",
	);
});

test("ADR 0002's window west of UTC starts at Lima's local midnight", () => {
	// 22:00 on 1 October in Lima (UTC-5) is 2 October in UTC; the window opens 2 September locally.
	expect(windowStart(new Date("2026-10-02T03:00:00Z"), 30, "America/Lima").toISOString()).toBe(
		"2026-09-02T05:00:00.000Z",
	);
});
