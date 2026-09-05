const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function formatInboxTimestamp(
	iso: string,
	locale: string,
	nowMs: number = Date.now(),
): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}

	const diffMs = date.getTime() - nowMs;
	const absMs = Math.abs(diffMs);
	const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

	if (absMs < HOUR_MS) {
		return relative.format(Math.round(diffMs / MINUTE_MS), "minute");
	}
	if (absMs < DAY_MS) {
		return relative.format(Math.round(diffMs / HOUR_MS), "hour");
	}
	if (absMs < WEEK_MS) {
		return relative.format(Math.round(diffMs / DAY_MS), "day");
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}
