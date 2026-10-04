import { expect, test } from "vitest";

import { alertSounds } from "./burst";

/**
 * The burst rule (ADR 0019 "Bursts", spec #84): an alert sounds only if this operator's previous
 * alert on this thread is 2 minutes old or more, or there is none; otherwise it is a silent
 * replacement. The clock is explicit.
 */
const first = new Date("2026-10-05T09:00:00.000Z");
const later = (ms: number) => new Date(first.getTime() + ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;

test("the first alert on a thread sounds", () => {
	expect(alertSounds(null, first)).toBe(true);
});

test("an alert at the same moment as the last one is silent", () => {
	expect(alertSounds(first, first)).toBe(false);
});

test("1:59 after the last alert is silent", () => {
	expect(alertSounds(first, later(MINUTE + 59 * SECOND))).toBe(false);
});

test("2:00 after the last alert sounds again", () => {
	expect(alertSounds(first, later(2 * MINUTE))).toBe(true);
});

test("an alert decided after a later one (a reordered burst) is silent", () => {
	expect(alertSounds(later(30 * SECOND), first)).toBe(false);
});
