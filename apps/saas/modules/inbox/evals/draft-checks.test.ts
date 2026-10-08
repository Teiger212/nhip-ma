import { describe, expect, test } from "vitest";

import { extractFromInbound } from "../lib/extract";
import { greetingTemplate } from "../lib/greeting";
import type { Message } from "../lib/types";
import { type CheckId, type CheckThread, checkDraft } from "./draft-checks";

/**
 * The draft eval's local checks (#254), from ADR 0024 "The rules a draft follows" and "Models":
 * a draft fails with a number the guest didn't write, a repeated open question, an intro, more
 * than 4 sentences, or an answer that isn't the JSON shape. One passing and one failing draft
 * per check, in English and in Vietnamese. No model.
 */

const OFFICE = "Hanoi Nest Seekers";

type Turn = Pick<Message, "direction" | "source" | "text">;
const guest = (text: string): Turn => ({ direction: "in", source: "guest", text });
const agent = (text: string): Turn => ({ direction: "out", source: "nhip", text });
/** The auto-reply as the office sends it to the guest's first message (ADR 0021). */
const autoReply = (first: string): Turn => {
	const { language, qualification } = extractFromInbound(first);
	return {
		direction: "out",
		source: "auto-reply",
		text: greetingTemplate(language, qualification, OFFICE),
	};
};

const thread = (...messages: Turn[]): CheckThread => ({ messages, officeNames: [OFFICE] });
const json = (reply: string, officeReply = reply) =>
	JSON.stringify({ reply, office_reply: officeReply });

function verdictOf(raw: string, on: CheckThread, id: CheckId) {
	return checkDraft(raw, on).verdicts.find((verdict) => verdict.id === id);
}

const EN_FIRST = "Hi, looking to rent a 3 bedroom in Tay Ho, budget $2800/month.";
const EN = thread(
	guest(EN_FIRST),
	autoReply(EN_FIRST),
	agent("Thanks, I'll pull a few places together for you."),
	guest("Great, thanks!"),
);
const VI_FIRST = "Chào em, chị muốn thuê căn hộ ở Tây Hồ, ngân sách 30 triệu.";
const VI = thread(
	guest(VI_FIRST),
	autoReply(VI_FIRST),
	agent("Dạ em gửi chị vài căn phù hợp nhé."),
	guest("Ok em, cảm ơn em."),
);

describe("JSON shape: the reply and the same reply in the office language", () => {
	test("English", () => {
		expect(verdictOf(json("Thanks, I'll come back to you here today."), EN, "json")?.pass).toBe(
			true,
		);
		const plain = checkDraft("Thanks, I'll come back to you here today.", EN);
		expect(plain.pass).toBe(false);
		expect(plain.verdicts[0]).toMatchObject({ id: "json", pass: false });
		// Nothing else is judged on an answer that isn't the shape.
		expect(plain.verdicts.slice(1).every((verdict) => verdict.pass === null)).toBe(true);
	});

	test("Vietnamese", () => {
		expect(verdictOf(json("Dạ em sẽ gửi chị ngay ạ."), VI, "json")?.pass).toBe(true);
		expect(verdictOf(JSON.stringify({ reply: "Dạ em sẽ gửi chị ngay ạ." }), VI, "json")?.pass).toBe(
			false,
		);
	});
});

describe("a number the guest didn't write fails", () => {
	test("English: the guest's $2800 passes as $2,800; the agent's $2,900 doesn't", () => {
		expect(
			verdictOf(
				json("I'll pull together 3 bedroom options in Tay Ho around $2,800."),
				EN,
				"numbers",
			)?.pass,
		).toBe(true);
		expect(verdictOf(json("I'll send you the one at $2,900 first."), EN, "numbers")).toMatchObject({
			pass: false,
			detail: "reply: 2,900",
		});
	});

	test("Vietnamese, in the office twin too", () => {
		expect(
			verdictOf(json("Dạ em tìm các căn tầm 30 triệu cho chị nhé."), VI, "numbers")?.pass,
		).toBe(true);
		expect(
			verdictOf(
				json("Dạ em tìm các căn tầm 30 triệu cho chị nhé.", "Em tìm các căn tầm 28 triệu ạ."),
				VI,
				"numbers",
			),
		).toMatchObject({ pass: false, detail: "office reply: 28" });
	});
});

describe("a question the office asked that the guest hasn't answered fails when asked again", () => {
	test("English: the auto-reply asked about move-in", () => {
		expect(
			verdictOf(json("Great, I'll send a few places in Tay Ho today."), EN, "open-question")?.pass,
		).toBe(true);
		expect(
			verdictOf(json("Great! When would you like to move in?"), EN, "open-question"),
		).toMatchObject({ pass: false, detail: "reply: asks again: timeframe (open)" });
	});

	test("English: once the guest answers it, asking it again still fails", () => {
		const answered = thread(...EN.messages, guest("We'd like to move in early January."));
		expect(
			verdictOf(json("Got it, I'll line up places for early January."), answered, "open-question")
				?.pass,
		).toBe(true);
		expect(
			verdictOf(json("Got it. When would you like to move in?"), answered, "open-question"),
		).toMatchObject({ pass: false, detail: "reply: asks again: timeframe (answered)" });
	});

	test("English: the guest's budget mentioned in a question is not asking for it", () => {
		expect(
			verdictOf(json("Would you look slightly above your budget?"), EN, "open-question")?.pass,
		).toBe(true);
		expect(verdictOf(json("What's your budget?"), EN, "open-question")?.pass).toBe(false);
	});

	test("Vietnamese", () => {
		expect(
			verdictOf(json("Dạ em gửi chị danh sách trong hôm nay ạ."), VI, "open-question")?.pass,
		).toBe(true);
		expect(verdictOf(json("Dạ chị dự kiến khi nào dọn vào ạ?"), VI, "open-question")?.pass).toBe(
			false,
		);
	});
});

describe("an intro fails: the model never introduces anyone", () => {
	test("English: greeting the guest by name is no intro", () => {
		expect(verdictOf(json("Hi Claire, I'll send the photos shortly."), EN, "intro")?.pass).toBe(
			true,
		);
		expect(verdictOf(json("Hi Claire, I'm Linh from the team."), EN, "intro")?.pass).toBe(false);
		expect(verdictOf(json("Thanks for writing to Hanoi Nest Seekers."), EN, "intro")?.pass).toBe(
			false,
		);
	});

	test("Vietnamese", () => {
		expect(verdictOf(json("Chào anh Hải, em sẽ gửi thêm ảnh ạ."), VI, "intro")?.pass).toBe(true);
		expect(
			verdictOf(json("Chào anh Hải, em là Linh, em sẽ gửi thêm ảnh ạ."), VI, "intro")?.pass,
		).toBe(false);
	});
});

describe("more than 4 sentences fails", () => {
	test("English", () => {
		const four = "Thanks. I'll check. I'll send photos. Talk soon.";
		expect(verdictOf(json(four), EN, "length")?.pass).toBe(true);
		expect(verdictOf(json(`${four} One more thing.`), EN, "length")).toMatchObject({
			pass: false,
			detail: "reply: 5 sentences",
		});
	});

	test("Vietnamese: a figure such as 9,5 triệu is not a sentence stop", () => {
		const four = "Dạ vâng. Căn 9,5 triệu em sẽ kiểm tra. Em gửi ảnh sau ạ. Chị chờ em nhé.";
		expect(verdictOf(json(four), VI, "length")?.pass).toBe(true);
		expect(verdictOf(json(`${four} Cảm ơn chị.`), VI, "length")?.pass).toBe(false);
	});
});

test("a draft that keeps every rule passes as a whole", () => {
	const result = checkDraft(json("Great, I'll send a few places in Tay Ho today."), EN);
	expect(result.pass).toBe(true);
	expect(result.draft?.reply).toBe("Great, I'll send a few places in Tay Ho today.");
});
