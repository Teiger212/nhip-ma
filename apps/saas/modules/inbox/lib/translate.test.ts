import { expect, test } from "vitest";

import {
	TRANSLATION_MAX_ATTEMPTS,
	TRANSLATION_RETRY_AFTER_MS,
	translationRetryDue,
} from "./translate";

const MINUTE = 60_000;

test("a failed translation is retried only after the backoff, and never past the cap (ADR 0007)", () => {
	const now = Date.parse("2026-10-02T12:00:00.000Z");
	const failedAgo = (ms: number, attempts = 1) => ({
		attempts,
		lastFailedAt: new Date(now - ms).toISOString(),
	});
	expect(TRANSLATION_RETRY_AFTER_MS).toBe(10 * MINUTE);
	expect(translationRetryDue(undefined, now)).toBe(true);
	expect(translationRetryDue(failedAgo(0), now)).toBe(false);
	expect(translationRetryDue(failedAgo(10 * MINUTE - 1), now)).toBe(false);
	expect(translationRetryDue(failedAgo(10 * MINUTE), now)).toBe(true);
	expect(translationRetryDue(failedAgo(10 * MINUTE, TRANSLATION_MAX_ATTEMPTS - 1), now)).toBe(true);
	expect(translationRetryDue(failedAgo(24 * 60 * MINUTE, TRANSLATION_MAX_ATTEMPTS), now)).toBe(
		false,
	);
});
