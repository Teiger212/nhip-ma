/** One office time zone until offices carry their own (a later market, e.g. Lima, adds it to market config). */
export const OFFICE_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** `timeZone`'s offset from UTC at `instant`, in milliseconds (east positive). */
function offsetMs(instant: Date, timeZone: string): number {
	const name =
		new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
			.formatToParts(instant)
			.find((part) => part.type === "timeZoneName")?.value ?? "";
	// "GMT" for UTC itself, otherwise "GMT+07:00" or "GMT-05:00" (seconds on historic zones).
	const match = /^GMT(?:([+-−])(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(name);
	if (!match) {
		throw new RangeError(`Unreadable offset "${name}" for ${timeZone}`);
	}
	const [, sign, hours, minutes, seconds] = match;
	if (!sign) {
		return 0;
	}
	const ms = ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds ?? 0)) * 1000;
	return sign === "+" ? ms : -ms;
}

/**
 * The start of Home's window (ADR 0002): local midnight in `timeZone` on the day `days - 1`
 * days before `now`'s local day, so the window is exactly `days` local calendar days
 * including today.
 */
export function windowStart(now: Date, days: number, timeZone: string): Date {
	const today = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const [year, month, date] = today.split("-").map(Number);
	// Local midnight read as if it were UTC; the zone's offset at that instant moves it.
	const wallClock = Date.UTC(year, month - 1, date - (days - 1));
	const guess = wallClock - offsetMs(new Date(wallClock), timeZone);
	// Across a DST change the offset at the true instant can differ from the first guess.
	return new Date(wallClock - offsetMs(new Date(guess), timeZone));
}
