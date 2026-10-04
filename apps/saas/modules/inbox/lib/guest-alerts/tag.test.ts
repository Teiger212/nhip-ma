import { expect, test } from "vitest";

import { alertTag } from "./tag";

/**
 * The notification's tag (ADR 0019 "Bursts", spec #84): a new alert replaces the last one for
 * the same thread, so the tag is stable per thread; the thread's id never leaves Nhịp, so the
 * tag is a keyed HMAC of it, under a key derived from BETTER_AUTH_SECRET (no new env var).
 */
const thread = "cm1threadopaqueid00000001";
const other = "cm1threadopaqueid00000002";

test("the same thread always gets the same tag", () => {
	expect(alertTag(thread)).toBe(alertTag(thread));
});

test("two threads get different tags", () => {
	expect(alertTag(thread)).not.toBe(alertTag(other));
});

test("the tag never contains the thread's id", () => {
	expect(alertTag(thread)).not.toContain(thread);
	expect(alertTag(thread)).toMatch(/^[0-9a-f]{64}$/);
});

test("the tag is keyed: another secret gives another tag", () => {
	const secret = "another-secret-0123456789abcdef-0123456789";
	expect(alertTag(thread, secret)).not.toBe(alertTag(thread));
	expect(alertTag(thread, secret)).toBe(alertTag(thread, secret));
});

test("without a secret there is no tag: an unkeyed hash of an id could be guessed", () => {
	expect(() => alertTag(thread, "")).toThrow(/BETTER_AUTH_SECRET/);
});
