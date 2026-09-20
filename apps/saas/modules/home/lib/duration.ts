const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A response time for a widget: minutes under an hour, hours under two days, days after.
 * `Intl` picks the unit's spelling per locale ("12 min", "12 phút"), so no copy is needed.
 */
export function formatDuration(ms: number, locale: string): string {
	const unit = (value: number, name: "minute" | "hour" | "day", digits: number) =>
		new Intl.NumberFormat(locale, {
			style: "unit",
			unit: name,
			unitDisplay: "short",
			maximumFractionDigits: digits,
		}).format(value);
	if (ms < HOUR_MS) {
		return unit(Math.round(ms / MINUTE_MS), "minute", 0);
	}
	if (ms < 2 * DAY_MS) {
		return unit(ms / HOUR_MS, "hour", 1);
	}
	return unit(ms / DAY_MS, "day", 1);
}
