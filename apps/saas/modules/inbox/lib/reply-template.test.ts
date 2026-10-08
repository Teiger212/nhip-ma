import { describe, expect, test } from "vitest";

import { greetingAsks, greetingQuestion, greetingTemplate } from "./greeting";
import { firstName, NEW_THREAD, replyTemplate, type TemplateThread } from "./reply-template";
import type { GuestLanguage, Qualification } from "./types";

/**
 * The template suggested reply (ADR 0024, "The template"; #253): in the agent's own voice, it
 * introduces the owner by first name and the office while the office has no human reply yet,
 * names the office alone on an Unassigned thread, introduces no one on a later turn, never asks
 * again what the office already asked, and asks nothing when nothing is missing.
 */

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
const OWNER = "Lan Pham";

const guestSays = (text: string) => ({ direction: "in" as const, source: "guest" as const, text });
const agentSays = (text: string) => ({ direction: "out" as const, source: "nhip" as const, text });
const appSays = (text: string) => ({ direction: "out" as const, source: "oa-echo" as const, text });

/** A thread whose guest wrote once, with nothing from the office yet. */
function thread(overrides: Partial<TemplateThread> = {}): TemplateThread {
	return {
		...NEW_THREAD,
		officeName: OFFICE,
		ownerName: OWNER,
		messages: [guestSays("Hi")],
		...overrides,
	};
}

/** The same thread after the auto-reply the office sends for `qualification` (ADR 0021). */
function greeted(qualification: Qualification, overrides: Partial<TemplateThread> = {}) {
	const autoReply = {
		direction: "out" as const,
		source: "auto-reply" as const,
		text: greetingTemplate("en", qualification, OFFICE),
	};
	return thread({ messages: [guestSays("Hi"), autoReply], ...overrides });
}

/** Any question mark, Western or full-width. */
const QUESTION = /[?？]/u;

describe.each(LANGUAGES)("in %s", (language) => {
	const reply = (qualification: Qualification, on: TemplateThread) => {
		const text = replyTemplate(language, qualification, on);
		expect(text).not.toBe("");
		return text;
	};

	test("an assigned thread with no human reply introduces the owner by first name and the office", () => {
		const text = reply(RENT_IN_TAY_HO, greeted(RENT_IN_TAY_HO));
		expect(text).toContain("Lan");
		expect(text).not.toContain("Pham");
		expect(text).toContain(OFFICE);
	});

	test("an Unassigned thread names the office only", () => {
		const text = reply(RENT_IN_TAY_HO, greeted(RENT_IN_TAY_HO, { ownerName: null }));
		expect(text).toContain(OFFICE);
		expect(text).not.toContain("Lan");
	});

	test("a later turn introduces no one and asks nothing", () => {
		for (const human of [agentSays("Sure, I'll send a few."), appSays("Sure.")]) {
			const text = reply(
				NOTHING,
				thread({ messages: [guestSays("Hi"), human, guestSays("And?")] }),
			);
			expect(text).not.toContain("Lan");
			expect(text).not.toContain(OFFICE);
			expect(text).not.toMatch(QUESTION);
		}
		// A sent Answer whose message isn't loaded still counts as the office's reply.
		const text = reply(NOTHING, thread({ sentAt: new Date().toISOString() }));
		expect(text).not.toContain(OFFICE);
	});

	test("a question the auto-reply asked is not asked again", () => {
		// The auto-reply to renting in Tây Hồ asked for budget and move-in (R3).
		const text = reply(RENT_IN_TAY_HO, greeted(RENT_IN_TAY_HO));
		for (const asked of asks(language, RENT_IN_TAY_HO)) expect(text).not.toContain(asked);
		// It asks the one detail left that changes what the agent sends: the household.
		expect(text).toMatch(QUESTION);
	});

	test("an auto-reply in another language still counts as asked", () => {
		const autoReply = {
			direction: "out" as const,
			source: "auto-reply" as const,
			text: greetingTemplate(language === "en" ? "vi" : "en", NOTHING, OFFICE),
		};
		const text = reply(NOTHING, thread({ messages: [guestSays("Hi"), autoReply] }));
		for (const asked of asks(language, NOTHING)) expect(text).not.toContain(asked);
	});

	test("a thread with nothing missing asks nothing extra", () => {
		expect(reply(EVERYTHING, greeted(EVERYTHING))).not.toMatch(QUESTION);
		expect(reply(EVERYTHING, thread())).not.toMatch(QUESTION);
	});

	test("it thanks the guest only when the office has sent nothing, never after the auto-reply", () => {
		const first = reply(RENT_IN_TAY_HO, thread());
		const afterGreeting = reply(RENT_IN_TAY_HO, greeted(RENT_IN_TAY_HO));
		expect(first.length).toBeGreaterThan(afterGreeting.length);
	});

	test("it states no figure", () => {
		expect(reply(EVERYTHING, thread())).not.toMatch(/\d/u);
	});
});

/** The auto-reply's questions for `qualification` (R3), worded in `language`. */
function asks(language: GuestLanguage, qualification: Qualification): string[] {
	const questions = greetingAsks(qualification).map((qualifier) =>
		greetingQuestion(language, qualifier),
	);
	expect(questions.length).toBeGreaterThan(0);
	return questions;
}

describe("the EN reference copy", () => {
	test("after the auto-reply, an assigned thread", () => {
		expect(replyTemplate("en", RENT_IN_TAY_HO, greeted(RENT_IN_TAY_HO))).toBe(
			"Hi, I'm Lan from Saigon Prime. I'll pull together a few options to rent in Tây Hồ and send them here shortly. Who will be living there, and how many bedrooms do you need?",
		);
	});

	test("with no auto-reply, an Unassigned thread with a named guest", () => {
		expect(replyTemplate("en", NOTHING, thread({ ownerName: null, guestName: "Minji" }))).toBe(
			"Hi Minji, this is Saigon Prime. Thanks for getting in touch. I'll help you find the right place. Are you looking to rent or to buy?",
		);
	});

	test("a later turn", () => {
		expect(
			replyTemplate(
				"en",
				RENT_IN_TAY_HO,
				thread({ messages: [guestSays("Hi"), agentSays("Hello")] }),
			),
		).toBe("Noted. I'll look into this and get back to you here shortly.");
	});
});

describe("the agent's first name", () => {
	test("is the first word of their account name", () => {
		expect(firstName("Lan Pham")).toBe("Lan");
		expect(firstName("  Walk Operator Two ")).toBe("Walk");
		expect(firstName("")).toBeNull();
		expect(firstName(null)).toBeNull();
	});
});
