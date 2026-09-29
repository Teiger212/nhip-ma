/**
 * What an error report may carry (PRODUCT.md, "Error reports never carry a guest's personal
 * data"): code, routes and error kinds, never what a guest or operator wrote. Everything sent
 * to error tracking passes through here first, on the server and in the browser.
 */

/** Longest error message kept; guest text quoted inside an error rarely survives this. */
export const MAX_MESSAGE_LENGTH = 200;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Seven or more digits, allowing spaces, dots, dashes and brackets between them, with an
// optional leading +: Vietnamese and international phone numbers.
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/g;
const LONG_ID = /\b[A-Za-z0-9_-]{32,}\b/g;

/** One free-text value, with contact details and long tokens removed and its length capped. */
export function scrubText(value: string): string {
	const cleaned = value
		.replace(EMAIL, "[email]")
		.replace(PHONE, "[phone]")
		.replace(LONG_ID, "[token]");
	return cleaned.length > MAX_MESSAGE_LENGTH
		? `${cleaned.slice(0, MAX_MESSAGE_LENGTH)}… [truncated]`
		: cleaned;
}

/** A URL without its query string or fragment (invitation ids, emails, search terms). */
export function scrubUrl(value: string): string {
	try {
		const url = new URL(value, "http://relative.invalid");
		const path = url.pathname.replace(PHONE, "[phone]").replace(LONG_ID, "[token]");
		return url.origin === "http://relative.invalid" ? path : `${url.origin}${path}`;
	} catch {
		return scrubText(value.split(/[?#]/)[0] ?? "");
	}
}

/** Keys whose values are never sent, whatever they hold. */
const DROPPED_KEYS = new Set([
	"$ip",
	"$referrer",
	"$initial_referrer",
	"$raw_user_agent",
	"body",
	"text",
	"reply",
	"guestName",
	"email",
	"phone",
]);
const URL_KEYS = new Set(["$current_url", "$pathname", "url", "path", "$referring_domain"]);

/**
 * A properties object as it may leave the app: dropped keys removed, URLs cut to their path,
 * every other string scrubbed, nested values walked.
 */
export function scrubProperties(value: unknown, key?: string): unknown {
	if (typeof value === "string") {
		return key && URL_KEYS.has(key) ? scrubUrl(value) : scrubText(value);
	}
	if (Array.isArray(value)) return value.map((item) => scrubProperties(item));
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			if (DROPPED_KEYS.has(k)) continue;
			out[k] = scrubProperties(v, k);
		}
		return out;
	}
	return value;
}
