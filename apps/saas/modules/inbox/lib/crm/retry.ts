import { CrmError, type CrmFailureKind } from "./types";

const MINUTE = 60 * 1000;

/**
 * How long a thread whose lead write linked nothing waits before opening it tries again (#211),
 * after its 1st, 2nd, 3rd and 4th failure in a row: ADR 0023's schedule. Past the fourth it stays
 * at the last. There is no cap: only someone opening the thread retries, at most this often, so
 * a thread never stops healing. The inbox polls every 10 s; without the wait each poll would ask
 * the CRM.
 */
export const CRM_RETRY_WAITS_MS = [1 * MINUTE, 5 * MINUTE, 15 * MINUTE, 60 * MINUTE] as const;

/**
 * A claim on writing a lead that is this old belongs to a write that died half-way (#211): longer
 * than any function runs (Vercel's ceiling is 800 s), so it is taken over.
 */
export const CRM_CLAIM_STALE_MS = 15 * MINUTE;

/** Whether a thread with these failed lead writes may be tried again at `now` (#211). */
export function crmRetryDue(
	failure: { attempts: number; lastFailedAt: string } | null,
	now: number,
): boolean {
	if (!failure) return true;
	const step = Math.min(Math.max(failure.attempts, 1), CRM_RETRY_WAITS_MS.length) - 1;
	return now - Date.parse(failure.lastFailedAt) >= CRM_RETRY_WAITS_MS[step];
}

/** Node's fetch gave up waiting on the CRM: its connect, headers or body timeout. */
const FETCH_TIMEOUT_CODES = new Set([
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"ETIMEDOUT",
]);

/** A failed CRM call's kind (#211): what its log line says, and nothing else. */
export function crmFailureKind(error: unknown): CrmFailureKind {
	if (error instanceof CrmError) return error.kind;
	if (error instanceof Error) {
		if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
		const cause: unknown = error.cause;
		if (
			typeof cause === "object" &&
			cause !== null &&
			"code" in cause &&
			typeof cause.code === "string" &&
			FETCH_TIMEOUT_CODES.has(cause.code)
		) {
			return "timeout";
		}
	}
	return "other";
}
