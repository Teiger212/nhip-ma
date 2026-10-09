const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * A moment as a date and a time on the locale's own clock (12-hour in English, 24-hour in
 * Vietnamese), with the year only when it isn't this year's: "Sep 21, 5:11 PM", "17:11 21 thg 9".
 * One format for every absolute time Nhịp shows (#94): a message's, a row's past a week, and
 * Home's "As of". `timeZone` reads it on the office's clock (Home); without it, the device's.
 */
export function formatDateTime(
	iso: string,
	locale: string,
	{ nowMs = Date.now(), timeZone }: { nowMs?: number; timeZone?: string } = {},
): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	const year = (at: Date) =>
		new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(at);
	const sameYear = year(date) === year(new Date(nowMs));
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		year: sameYear ? undefined : "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

/** How long ago, in the operator's words, within a week; past it, the date and time. */
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

	return formatDateTime(iso, locale, { nowMs });
}
