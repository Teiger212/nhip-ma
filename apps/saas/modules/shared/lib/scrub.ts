/**
 * What an error report may carry (PRODUCT.md, "Error reports never carry a guest's personal
 * data"): code locations, route templates and error kinds, never what a guest or operator
 * wrote. Everything sent to error tracking passes through here first, on the server and in the
 * browser. Scrubbing errs towards removing too much: a lost detail costs a little debugging, a
 * leaked phone number costs a guest.
 */

/** Longest error message kept. */
export const MAX_MESSAGE_LENGTH = 200;
/** Scrubbed text is cut to this first, so no regex ever runs on a huge input. */
const MAX_INPUT_LENGTH = 1000;

const LONG_ID = /\b[A-Za-z0-9_-]{32,}\b/g;
// cuid / cuid2 record ids (threads, offices, invitations): a letter then 20+ lowercase/digits.
const RECORD_ID = /\bc[a-z0-9]{20,31}\b/g;
const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;
// Seven or more digits, allowing spaces, dots, dashes and brackets between them, with an
// optional leading + or bracket: Vietnamese and international phone numbers (and, on
// purpose, anything else that long and digit-shaped).
const PHONE = /[(+]{0,3}\d[\d\s().-]{5,}\d/g;
// Quoted spans: error messages quote the values they choke on (Prisma, Zod, JSON parsers).
const QUOTED = /(["'`“”])(?:(?!\1).){1,500}\1/g;

/** One free-text value: ids, contact details and quoted values removed, length capped. */
export function scrubText(value: string): string {
	const cleaned = value
		.slice(0, MAX_INPUT_LENGTH)
		.replace(LONG_ID, "[token]")
		.replace(EMAIL, "[email]")
		.replace(RECORD_ID, "[id]")
		.replace(PHONE, "[phone]")
		.replace(QUOTED, "$1…$1");
	return cleaned.length > MAX_MESSAGE_LENGTH
		? `${cleaned.slice(0, MAX_MESSAGE_LENGTH)}… [truncated]`
		: cleaned;
}

/** A URL cut to its origin and scrubbed path: no query string, no fragment, ids removed. */
export function scrubUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value.slice(0, MAX_INPUT_LENGTH), "http://relative.invalid");
	} catch {
		return scrubText(value.split(/[?#]/)[0] ?? "");
	}
	let path = url.pathname;
	try {
		path = decodeURIComponent(path);
	} catch {
		// Keep the encoded path; it is scrubbed below either way.
	}
	const scrubbedPath = scrubText(path);
	return url.origin === "http://relative.invalid" ? scrubbedPath : `${url.origin}${scrubbedPath}`;
}

type Frame = Record<string, unknown>;
type ExceptionEntry = { type?: unknown; value?: unknown; stacktrace?: { frames?: unknown } };

/**
 * PostHog's `$exception_list`: each exception's type and message scrubbed, each stack frame's
 * file cut to a scrubbed path, and the source lines around each frame dropped.
 */
export function scrubExceptionList(list: unknown): unknown {
	if (!Array.isArray(list)) return [];
	return list.map((entry: ExceptionEntry) => {
		const frames = Array.isArray(entry.stacktrace?.frames)
			? (entry.stacktrace.frames as Frame[]).map((frame) => {
					const { pre_context: _pre, context_line: _line, post_context: _post, ...rest } = frame;
					return {
						...rest,
						...(typeof frame.filename === "string" ? { filename: scrubUrl(frame.filename) } : {}),
						...(typeof frame.abs_path === "string" ? { abs_path: scrubUrl(frame.abs_path) } : {}),
					};
				})
			: undefined;
		return {
			...entry,
			type: typeof entry.type === "string" ? scrubText(entry.type) : entry.type,
			value: typeof entry.value === "string" ? scrubText(entry.value) : entry.value,
			...(entry.stacktrace ? { stacktrace: { ...entry.stacktrace, frames } } : {}),
		};
	});
}

/**
 * The browser's exception event, rebuilt from an allowlist: what ingest needs (token,
 * distinct id), what groups the error (the exception list), and coarse context (browser, OS,
 * the page's scrubbed path). Everything else the SDK attaches is dropped.
 */
export function allowlistBrowserException(
	properties: Record<string, unknown>,
): Record<string, unknown> {
	return {
		token: properties.token,
		distinct_id: properties.distinct_id,
		$lib: properties.$lib,
		$lib_version: properties.$lib_version,
		$browser: properties.$browser,
		$os: properties.$os,
		$device_type: properties.$device_type,
		$pathname:
			typeof properties.$pathname === "string" ? scrubUrl(properties.$pathname) : undefined,
		$exception_level: properties.$exception_level,
		$exception_list: scrubExceptionList(properties.$exception_list),
		$process_person_profile: false,
		$geoip_disable: true,
	};
}

/** A machine-made code: a Prisma, Node or vendor code, an error kind, a class name. */
const CODE = /^[\w.-]{1,40}$/;

/**
 * An error as a server log names it (#220): its class, plus its code, kind and HTTP status where
 * it has them (`PrismaClientKnownRequestError P2002`, `TypeError ECONNREFUSED`, `HubSpotError
 * auth 401`). Never its message: a model's, a vendor's, a CRM's or the database's message can
 * quote what a guest wrote or who they are, and no pattern finds every name or sentence. Server
 * logs reach Vercel, which is telemetry under the PDPL.
 */
export function errorKind(error: unknown): string {
	if (!(error instanceof Error)) return "unknown";
	const { code, kind, status, statusCode } = error as {
		code?: unknown;
		kind?: unknown;
		status?: unknown;
		statusCode?: unknown;
	};
	const cause = (error.cause as { code?: unknown } | null | undefined)?.code;
	const parts = [error.name, code, kind, cause, status ?? statusCode].filter(
		(part): part is string | number =>
			(typeof part === "string" && CODE.test(part)) || Number.isInteger(part),
	);
	// Codes are machine-made, but a long digit run could still be someone's id: scrubbed anyway.
	return scrubText([...new Set(parts.map(String))].join(" ")) || "Error";
}

/**
 * A server error reduced to what may be sent. Prisma and Zod errors print the values they
 * rejected (a guest's message, a name), so only their kind and code are kept. Other messages
 * are scrubbed. The stack keeps only its real frame lines, so a multi-line message cannot
 * turn into "frames" the SDK sends as they are.
 */
export function scrubServerError(error: unknown): Error {
	const err = error instanceof Error ? error : new Error(String(error));
	const code = (err as { code?: unknown }).code;
	const valueDumping = err.name.startsWith("PrismaClient") || err.name === "ZodError";
	const message = valueDumping
		? `${err.name}${typeof code === "string" ? ` ${code}` : ""} (details withheld: they can carry guest data)`
		: scrubText(err.message.replace(/\s*\n\s*/g, " "));
	const scrubbed = new Error(message);
	scrubbed.name = err.name;
	const frames = (err.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line));
	scrubbed.stack = [`${err.name}: ${message}`, ...frames].join("\n");
	return scrubbed;
}
