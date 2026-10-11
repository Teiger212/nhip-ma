import { expect, test } from "vitest";

import { areaTone, languageTone } from "./fact-tags";

// DESIGN.md, Fact Tags (#314): each value keeps one colour everywhere.

test("each common guest language has its own fixed colour", () => {
	expect(["ko", "en", "ja", "vi", "zh", "ru"].map((code) => languageTone(code))).toEqual([
		"violet",
		"teal",
		"rose",
		"amber",
		"berry",
		"lagoon",
	]);
	expect(languageTone("KO")).toBe("violet");
});

test("an area keeps one colour however it is written, and never the plain tone", () => {
	expect(areaTone("Tây Hồ")).toBe(areaTone("  tây   hồ "));
	expect(areaTone("Tây Hồ".normalize("NFD"))).toBe(areaTone("Tây Hồ"));
	for (const area of ["Tây Hồ", "Cầu Giấy", "Ciputra", "Vinhomes", "Times City", "Landmark"]) {
		expect(areaTone(area)).not.toBe("plain");
	}
});

test("a language outside the map still gets one stable colour", () => {
	expect(languageTone("th")).toBe(languageTone("th"));
	expect(languageTone("th")).not.toBe("plain");
});
