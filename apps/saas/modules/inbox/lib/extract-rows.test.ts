import { expect, test } from "vitest";

import { emptyQualification } from "./extract";
import { arrangeExtractRows } from "./extract-rows";
import type { OneShot } from "./types";

const shot: OneShot = {
	language: "vi",
	qualification: { ...emptyQualification(), nationality: "Korean" },
	paperwork: { mentioned: false, flag: null },
	draft: { reply: "" },
};

test("filled facts come first and missing rows collapse, decided from values not labels", () => {
	const { visible, collapsed } = arrangeExtractRows(shot);
	expect(visible.map((row) => row.id)).toEqual(["language", "nationality"]);
	expect(collapsed.map((row) => row.id)).toEqual([
		"area",
		"inVietnamNow",
		"rentOrBuy",
		"moveIn",
		"budget",
		"beds",
		"paperwork",
	]);
	expect(visible.find((row) => row.id === "language")?.value).toBe("vi");
});

test("a false boolean is present, not missing", () => {
	const { visible } = arrangeExtractRows({
		...shot,
		qualification: { ...shot.qualification, inVietnamNow: false },
	});
	expect(visible.map((row) => row.id)).toContain("inVietnamNow");
	expect(visible.find((row) => row.id === "inVietnamNow")?.value).toBe(false);
});

test("mentioned paperwork stays visible and is never collapsed", () => {
	const { visible, collapsed } = arrangeExtractRows({
		...shot,
		paperwork: { mentioned: true, flag: "Do not invent Vietnamese law." },
	});
	expect(visible.map((row) => row.id)).toEqual(["language", "nationality", "paperwork"]);
	expect(collapsed.some((row) => row.id === "paperwork")).toBe(false);
});

test("no one-shot yields every row collapsed", () => {
	const { visible, collapsed } = arrangeExtractRows(null);
	expect(visible).toEqual([]);
	expect(collapsed).toHaveLength(9);
});
