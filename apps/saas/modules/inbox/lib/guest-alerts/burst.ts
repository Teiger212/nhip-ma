/** The quiet after which a thread's alert sounds again for the same operator (ADR 0019). */
export const BURST_QUIET_MS = 2 * 60 * 1000;

/**
 * The burst rule (ADR 0019 "Bursts"): an alert sounds when this operator's previous alert on
 * this thread is 2 minutes old or more, or there is none; otherwise it silently replaces the
 * last one. A previous alert stamped after `now` (two messages decided out of order) counts as
 * recent. The store decides it under a lock on (operator, thread), so two at once cannot both
 * sound.
 */
export function alertSounds(previousAt: Date | null, now: Date): boolean {
	return previousAt === null || now.getTime() - previousAt.getTime() >= BURST_QUIET_MS;
}
