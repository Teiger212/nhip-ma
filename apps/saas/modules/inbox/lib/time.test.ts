import { expect, test } from "vitest";

import { formatInboxTimestamp } from "./time";

const now = Date.parse("2026-09-05T10:00:00.000Z");

test("recent timestamps use localized relative time", () => {
	expect(formatInboxTimestamp("2026-09-05T09:50:00.000Z", "en", now)).toBe("10 minutes ago");
	expect(formatInboxTimestamp("2026-09-05T08:00:00.000Z", "en", now)).toBe("2 hours ago");
	expect(formatInboxTimestamp("2026-09-03T10:00:00.000Z", "en", now)).toBe("2 days ago");
	expect(formatInboxTimestamp("2026-09-05T09:50:00.000Z", "vi", now)).toMatch(/10/);
});

test("older timestamps use a localized datetime", () => {
	const formatted = formatInboxTimestamp("2026-08-01T03:15:00.000Z", "en", now);
	expect(formatted).toMatch(/Aug/);
	expect(formatted).not.toBe("2026-08-01T03:15:00.000Z");
});

test("invalid ISO stays as stored text", () => {
	expect(formatInboxTimestamp("not-a-date", "en", now)).toBe("not-a-date");
});
