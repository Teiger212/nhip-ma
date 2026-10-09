const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** One run of a formatted duration: digits (set in mono) or the unit around them. */
export type DurationPart = { value: string; number: boolean };

/**
 * The units' short spellings, from the interface language's copy (`home.units`): "d", "h",
 * "min" in English; "ngày", "giờ", "phút" in Vietnamese. Passed in, so the server (Home) and the
 * client (Waiting now) spell a duration the same way.
 */
export type DurationUnits = { day: string; hour: string; minute: string };

/**
 * A response time or a wait, in whole units an operator would say, the two largest that apply
 * (#94): "12 min", "3 h 20 min", "1 d 16 h"; a zero second unit is left out ("2 h", "3 d").
 * Never a decimal ("40.2 hr"). Split into runs so a figure can set its digits apart from the unit.
 */
export function durationParts(ms: number, units: DurationUnits): DurationPart[] {
	const minutes = Math.max(0, Math.round(ms / MINUTE_MS));
	const days = Math.floor(minutes / MINUTES_PER_DAY);
	const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
	const rest = minutes % MINUTES_PER_HOUR;
	const pairs: [number, string][] =
		days > 0
			? [
					[days, units.day],
					[hours, units.hour],
				]
			: hours > 0
				? [
						[hours, units.hour],
						[rest, units.minute],
					]
				: [[rest, units.minute]];
	const shown = pairs.filter(([value], index) => index === 0 || value > 0);
	return shown.flatMap(([value, unit], index) => [
		{ value: String(value), number: true },
		{ value: index < shown.length - 1 ? ` ${unit} ` : ` ${unit}`, number: false },
	]);
}

export function formatDuration(ms: number, units: DurationUnits): string {
	return durationParts(ms, units)
		.map((part) => part.value)
		.join("");
}
