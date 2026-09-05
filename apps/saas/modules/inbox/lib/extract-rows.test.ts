import { expect, test } from "vitest";

import { arrangeExtractRows, isEmptyExtractValue } from "./extract-rows";

const missing = "(missing)";
const noneMentioned = "none mentioned";
const paperworkFlag =
	"Guest mentioned paperwork or ownership. Do not invent Vietnamese law. Do not promise a pink book / sổ hồng.";

test("filled facts come first and missing rows collapse", () => {
	const { visible, collapsed } = arrangeExtractRows([
		{ id: "language", label: "Language", value: "Vietnamese", isEmpty: false },
		{ id: "area", label: "Area", value: missing, isEmpty: true },
		{ id: "nationality", label: "Nationality", value: "Korean", isEmpty: false },
		{ id: "paperwork", label: "Paperwork", value: noneMentioned, isEmpty: true },
	]);

	expect(visible.map((row) => row.id)).toEqual(["language", "nationality"]);
	expect(collapsed.map((row) => row.id)).toEqual(["area", "paperwork"]);
	expect(isEmptyExtractValue(missing, [missing, noneMentioned])).toBe(true);
	expect(isEmptyExtractValue(noneMentioned, [missing, noneMentioned])).toBe(true);
	expect(isEmptyExtractValue("Korean", [missing, noneMentioned])).toBe(false);
});

test("mentioned paperwork stays visible and is never collapsed", () => {
	const { visible, collapsed } = arrangeExtractRows([
		{ id: "area", label: "Area", value: missing, isEmpty: true },
		{
			id: "paperwork",
			label: "Paperwork",
			value: paperworkFlag,
			isEmpty: false,
			forceVisible: true,
		},
	]);

	expect(visible.map((row) => row.id)).toEqual(["paperwork"]);
	expect(visible[0]?.value).toMatch(/Do not invent Vietnamese law/);
	expect(collapsed.map((row) => row.id)).toEqual(["area"]);
	expect(collapsed.some((row) => row.id === "paperwork")).toBe(false);
});
