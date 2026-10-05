const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** One run of a formatted duration: digits (set in mono) or the unit around them. */
export type DurationPart = { value: string; number: boolean };

const NUMBER_PARTS = new Set(["integer", "group", "decimal", "fraction", "minusSign"]);

/**
 * A response time for a widget: minutes under an hour, hours under two days, days after.
 * `Intl` picks the unit's spelling per locale ("12 min", "12 phút"), so no copy is needed.
 * Split into runs so a figure can set its digits apart from the unit.
 */
export function durationParts(ms: number, locale: string): DurationPart[] {
	const unit = (value: number, name: "minute" | "hour" | "day", digits: number) =>
		new Intl.NumberFormat(locale, {
			style: "unit",
			unit: name,
			unitDisplay: "short",
			maximumFractionDigits: digits,
		}).formatToParts(value);
	const parts =
		ms < HOUR_MS
			? unit(Math.round(ms / MINUTE_MS), "minute", 0)
			: ms < 2 * DAY_MS
				? unit(ms / HOUR_MS, "hour", 1)
				: unit(ms / DAY_MS, "day", 1);
	const runs: DurationPart[] = [];
	for (const part of parts) {
		const number = NUMBER_PARTS.has(part.type);
		const last = runs.at(-1);
		if (last && last.number === number) last.value += part.value;
		else runs.push({ value: part.value, number });
	}
	return runs;
}

export function formatDuration(ms: number, locale: string): string {
	return durationParts(ms, locale)
		.map((part) => part.value)
		.join("");
}
