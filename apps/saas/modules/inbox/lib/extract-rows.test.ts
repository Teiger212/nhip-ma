import { expect, test } from "vitest";

import { emptyQualification, extractFromInbound } from "./extract";
import { arrangeExtractRows } from "./extract-rows";
import { greetingAsks } from "./greeting";
import type { OneShot } from "./types";

const shot: OneShot = {
	language: "vi",
	qualification: { ...emptyQualification(), nationality: "Korean" },
	paperwork: { mentioned: false, flag: null },
	draft: { reply: "", answersMessageId: null, source: "template" },
};

/** A one-shot from a guest's own words, as the inbound path builds it. */
function from(text: string): OneShot {
	return { ...extractFromInbound(text), draft: shot.draft };
}

test("only known facts get a row, decided from values not labels", () => {
	const { rows } = arrangeExtractRows(shot);
	expect(rows.map((row) => row.id)).toEqual(["language", "nationality"]);
	expect(rows.find((row) => row.id === "language")?.value).toBe("vi");
});

test("a false boolean is known, so In Vietnam now shows", () => {
	const { rows } = arrangeExtractRows({
		...shot,
		qualification: { ...shot.qualification, inVietnamNow: false },
	});
	expect(rows.find((row) => row.id === "inVietnamNow")?.value).toBe(false);
});

test("paperwork shows only when mentioned, and is never missing (#244)", () => {
	expect(arrangeExtractRows(shot).rows.some((row) => row.id === "paperwork")).toBe(false);
	const mentioned = arrangeExtractRows({
		...shot,
		paperwork: { mentioned: true, flag: "Do not invent Vietnamese law." },
	});
	expect(mentioned.rows.map((row) => row.id)).toEqual(["language", "nationality", "paperwork"]);
	expect(mentioned.missing).not.toContain("paperwork");
});

test("missing names only the auto-reply's asks, in R3's order (#244, ADR 0021 R3)", () => {
	// Guest details 1: rent, Tây Hồ and two bedrooms given; budget and move-in are left.
	const details = arrangeExtractRows(from("I want to rent a 2 bedroom in Tay Ho."));
	expect(details.missing).toEqual(["budget", "moveIn"]);
	expect(details.rows.map((row) => row.id)).toEqual(["language", "area", "rentOrBuy", "beds"]);
});

test("nationality, In Vietnam now and paperwork are never missing", () => {
	const { missing } = arrangeExtractRows({ ...shot, qualification: emptyQualification() });
	expect(missing).toEqual(["rentOrBuy", "area", "budget", "moveIn", "beds"]);
});

test("a guest who gave everything has nothing missing and no unknown rows (#244)", () => {
	const details = arrangeExtractRows(
		from("I want to rent a 2 bedroom in Tay Ho, budget $1500/month, moving in next month."),
	);
	expect(details.missing).toEqual([]);
	expect(details.rows.map((row) => row.id)).toEqual([
		"language",
		"area",
		"rentOrBuy",
		"moveIn",
		"budget",
		"beds",
	]);
});

test("the card and the auto-reply agree: the auto-reply asks the first of what is missing", () => {
	const fieldOf = {
		rentOrBuy: "rentOrBuy",
		area: "area",
		budget: "budget",
		timeframe: "moveIn",
		household: "beds",
	};
	for (const text of [
		"",
		"I want to rent in Tay Ho.",
		"Buying, budget $300k",
		"2 bedroom next month",
	]) {
		const one = from(text);
		const asks = greetingAsks(one.qualification).map((qualifier) => fieldOf[qualifier]);
		expect(arrangeExtractRows(one).missing.slice(0, asks.length)).toEqual(asks);
	}
});

test("no one-shot yields no rows and every ask missing", () => {
	expect(arrangeExtractRows(null)).toEqual({
		rows: [],
		missing: ["rentOrBuy", "area", "budget", "moveIn", "beds"],
	});
});
