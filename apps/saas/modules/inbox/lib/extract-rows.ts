import type { Conversation, Qualification } from "./types";

/**
 * Which extract fields the operator sees, and in what order. Presence is decided
 * here from the qualification value, never from rendered text, so a translation
 * change cannot move a row between the visible and collapsed groups.
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
	/** Raw value for the renderer to translate. `null` means the guest did not say. */
	value: string | boolean | null;
	present: boolean;
	/** Rows that must stay visible even when the rest collapse (mentioned paperwork). */
	forceVisible?: boolean;
};

export type ArrangedExtractRows = {
	visible: ExtractRow[];
	collapsed: ExtractRow[];
};

function qualificationRows(q: Qualification | null | undefined): ExtractRow[] {
	const present = (value: string | boolean | null | undefined): boolean =>
		value !== null && value !== undefined && value !== "";
	return [
		{ id: "area", value: q?.areaOfInterest ?? null, present: present(q?.areaOfInterest) },
		{ id: "nationality", value: q?.nationality ?? null, present: present(q?.nationality) },
		{ id: "inVietnamNow", value: q?.inVietnamNow ?? null, present: present(q?.inVietnamNow) },
		{ id: "rentOrBuy", value: q?.rentOrBuy ?? null, present: present(q?.rentOrBuy) },
		{ id: "moveIn", value: q?.timeframe ?? null, present: present(q?.timeframe) },
		{ id: "budget", value: q?.budgetBand ?? null, present: present(q?.budgetBand) },
		{ id: "beds", value: q?.bedsOrHousehold ?? null, present: present(q?.bedsOrHousehold) },
	];
}

/** Filled facts first; empty rows collapse; mentioned paperwork never collapses. */
export function arrangeExtractRows(
	oneShot: Pick<Conversation, "oneShot">["oneShot"],
): ArrangedExtractRows {
	const paperworkMentioned = Boolean(oneShot?.paperwork?.mentioned);
	const rows: ExtractRow[] = [
		{ id: "language", value: oneShot?.language ?? null, present: Boolean(oneShot?.language) },
		...qualificationRows(oneShot?.qualification),
		{
			id: "paperwork",
			value: paperworkMentioned,
			present: paperworkMentioned,
			forceVisible: paperworkMentioned,
		},
	];
	const visible: ExtractRow[] = [];
	const collapsed: ExtractRow[] = [];
	for (const row of rows) {
		if (row.forceVisible || row.present) visible.push(row);
		else collapsed.push(row);
	}
	return { visible, collapsed };
}
