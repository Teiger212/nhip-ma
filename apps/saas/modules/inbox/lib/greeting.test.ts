import { describe, expect, test } from "vitest";

import { greetingAsks, greetingLabel, greetingTemplate, missingQualifiers } from "./greeting";
import type { GuestLanguage, Qualification } from "./types";

// The auto-reply's fixed template (ADR 0021: G2, R3, R7, R9).

const NOTHING: Qualification = {
	areaOfInterest: null,
	nationality: null,
	inVietnamNow: null,
	rentOrBuy: null,
	timeframe: null,
	budgetBand: null,
	bedsOrHousehold: null,
};
const RENT_IN_TAY_HO: Qualification = { ...NOTHING, rentOrBuy: "rent", areaOfInterest: "Tây Hồ" };
const EVERYTHING: Qualification = {
	...RENT_IN_TAY_HO,
	timeframe: "next month",
	budgetBand: "$1500/month",
	bedsOrHousehold: "2 bed",
};
const LANGUAGES: GuestLanguage[] = ["en", "vi", "ja", "ko", "ru"];
const OFFICE = "Saigon Prime";

/** The template, which is never empty: every check below reads real text. */
function template(language: GuestLanguage, qualification: Qualification, office = OFFICE): string {
	const text = greetingTemplate(language, qualification, office);
	expect(text).not.toBe("");
	return text;
}

describe("what the auto-reply asks for (R3: rent or buy, area, budget, timeframe, household; two at most)", () => {
	test("nothing extracted: rent or buy, then area", () => {
		expect(greetingAsks(NOTHING)).toEqual(["rentOrBuy", "area"]);
	});

	test("rent and area given: budget, then timeframe", () => {
		expect(greetingAsks(RENT_IN_TAY_HO)).toEqual(["budget", "timeframe"]);
	});

	test("only the household missing: just that", () => {
		expect(greetingAsks({ ...EVERYTHING, bedsOrHousehold: null })).toEqual(["household"]);
	});

	test("an area and a budget given: rent or buy, then timeframe", () => {
		expect(greetingAsks({ ...NOTHING, areaOfInterest: "Ba Đình", budgetBand: "1000" })).toEqual([
			"rentOrBuy",
			"timeframe",
		]);
	});

	test("nothing missing: no question", () => {
		expect(greetingAsks(EVERYTHING)).toEqual([]);
	});

	test("everything missing is listed in R3's order, uncapped, for the guest details (#244)", () => {
		expect(missingQualifiers(NOTHING)).toEqual([
			"rentOrBuy",
			"area",
			"budget",
			"timeframe",
			"household",
		]);
		expect(missingQualifiers(RENT_IN_TAY_HO)).toEqual(["budget", "timeframe", "household"]);
		expect(
			missingQualifiers({ ...NOTHING, nationality: "Korean", inVietnamNow: true }),
		).toHaveLength(5);
	});
});

describe("the label (R7): always on, names the office", () => {
	test("English reads as ADR 0021 proposes", () => {
		expect(greetingLabel("en", OFFICE)).toBe(
			"Auto-reply from Saigon Prime: a colleague will continue with you right here.",
		);
	});

	test.each(LANGUAGES)("%s names the office", (language) => {
		expect(greetingLabel(language, OFFICE)).toContain(OFFICE);
	});

	test.each([
		["vi", /[ăâđơưảẻỉỏủỷạẹịọụỵẽĩũỹằắẳẵặầấẩẫậềếểễệồốổỗộờớởỡợừứửữự]/u],
		["ja", /[぀-ヿ]/u],
		["ko", /[가-힯]/u],
		["ru", /[Ѐ-ӿ]/u],
	] as const)("%s is in the guest's own script", (language, script) => {
		expect(greetingLabel(language, OFFICE).replace(OFFICE, "")).toMatch(script);
	});
});

describe("the template (R9): greeting, acknowledgement, up to two questions, then the label", () => {
	const cases = LANGUAGES.flatMap((language) =>
		[NOTHING, RENT_IN_TAY_HO, EVERYTHING, { ...NOTHING, areaOfInterest: "Tây Hồ" }].map(
			(qualification) => ({ language, qualification }),
		),
	);

	test.each(cases)("$language: its own text has no digit (G2)", ({ language, qualification }) => {
		expect(template(language, qualification)).not.toMatch(/\p{Nd}/u);
	});

	test.each(cases)(
		"$language: no budget, timeframe or household value is repeated",
		({ language, qualification }) => {
			const text = template(language, qualification);
			for (const value of [
				qualification.budgetBand,
				qualification.timeframe,
				qualification.bedsOrHousehold,
			]) {
				if (value) expect(text).not.toContain(value);
			}
		},
	);

	test.each(cases)("$language: at most two questions", ({ language, qualification }) => {
		const text = template(language, qualification);
		expect((text.match(/[?？]/gu) ?? []).length).toBe(greetingAsks(qualification).length);
		expect(greetingAsks(qualification).length).toBeLessThanOrEqual(2);
	});

	test.each(cases)("$language: the label is the last line", ({ language, qualification }) => {
		const lines = template(language, qualification).split("\n");
		expect(lines.at(-1)).toBe(greetingLabel(language, OFFICE));
		expect(lines.filter((line) => line.includes(OFFICE))).toHaveLength(1);
	});

	test("a digit in the office's own name is the office's, not the template's", () => {
		const text = template("en", NOTHING, "Hanoi 24 Homes");
		expect(text.replace("Hanoi 24 Homes", "")).not.toMatch(/\p{Nd}/u);
	});

	test("English, rent in Tây Hồ: acknowledges both, asks budget then move-in (First greeting 1)", () => {
		expect(greetingTemplate("en", RENT_IN_TAY_HO, OFFICE)).toBe(
			"Thanks for writing to us. We have your note about renting in Tây Hồ. What budget do you have in mind? When would you like to move in?\n\nAuto-reply from Saigon Prime: a colleague will continue with you right here.",
		);
	});

	test("English, nothing extracted: thanks, then rent or buy and area", () => {
		expect(greetingTemplate("en", NOTHING, OFFICE)).toBe(
			"Thanks for writing to us. Are you looking to rent or to buy? Which area or building do you have in mind?\n\nAuto-reply from Saigon Prime: a colleague will continue with you right here.",
		);
	});

	test("English, an area alone reads as the area, never 'about in'", () => {
		const text = greetingTemplate("en", { ...NOTHING, areaOfInterest: "Tây Hồ" }, OFFICE);
		expect(text).toContain("We have your note about Tây Hồ.");
		expect(text).not.toContain("about in");
	});

	test("English, everything given: acknowledged by kind, no question", () => {
		expect(greetingTemplate("en", { ...EVERYTHING, rentOrBuy: "buy" }, OFFICE)).toBe(
			"Thanks for writing to us. We have your note about buying in Tây Hồ, your budget, your timing and your household.\n\nAuto-reply from Saigon Prime: a colleague will continue with you right here.",
		);
	});
});
