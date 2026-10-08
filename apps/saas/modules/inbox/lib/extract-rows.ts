import { missingQualifiers, type Qualifier } from "./greeting";
import { namedLanguage } from "./language-name";
import type { Conversation, Qualification } from "./types";

/**
 * Which extract fields the operator sees, and in what order. Presence is decided
 * here from the qualification value, never from rendered text, so a translation
 * change cannot add or drop a row.
 */
export const EXTRACT_FIELD_IDS = [
	"language",
	"area",
	"nationality",
	"inVietnamNow",
	"rentOrBuy",
	"moveIn",
	"budget",
	"beds",
	"paperwork",
] as const;

export type ExtractFieldId = (typeof EXTRACT_FIELD_IDS)[number];

export type ExtractRow = {
	id: ExtractFieldId;
	/** Raw value for the renderer to translate; only known facts get a row. */
	value: string | boolean;
};

export type GuestDetails = {
	/** The facts the guest gave, in field order. */
	rows: ExtractRow[];
	/** What the agent should still ask for, in the auto-reply's order (ADR 0021 R3, #244). */
	missing: ExtractFieldId[];
};

/** The auto-reply's asks, as the details' fields. */
const FIELD_OF_QUALIFIER: Record<Qualifier, ExtractFieldId> = {
	rentOrBuy: "rentOrBuy",
	area: "area",
	budget: "budget",
	timeframe: "moveIn",
	household: "beds",
};

function known<T>(value: T | null | undefined | ""): value is T {
	return value !== null && value !== undefined && value !== "";
}

function qualificationRows(q: Qualification | undefined): ExtractRow[] {
	const values: Array<[ExtractFieldId, string | boolean | null | undefined]> = [
		["area", q?.areaOfInterest],
		["nationality", q?.nationality],
		["inVietnamNow", q?.inVietnamNow],
		["rentOrBuy", q?.rentOrBuy],
		["moveIn", q?.timeframe],
		["budget", q?.budgetBand],
		["beds", q?.bedsOrHousehold],
	];
	return values.flatMap(([id, value]) => (known(value) ? [{ id, value }] : []));
}

/**
 * The guest details: the known facts as rows (nationality and In Vietnam now only when known,
 * paperwork only when mentioned), and what is missing, which only the auto-reply's asks can be.
 */
export function arrangeExtractRows(
	oneShot: Pick<Conversation, "oneShot">["oneShot"],
): GuestDetails {
	const rows: ExtractRow[] = [
		// The guest language, named (#245), whether Nhịp supports it or not.
		...(oneShot?.language ? [{ id: "language" as const, value: namedLanguage(oneShot) }] : []),
		...qualificationRows(oneShot?.qualification),
		...(oneShot?.paperwork?.mentioned ? [{ id: "paperwork" as const, value: true }] : []),
	];
	const missing = missingQualifiers(oneShot?.qualification ?? {}).map(
		(qualifier) => FIELD_OF_QUALIFIER[qualifier],
	);
	return { rows, missing };
}
