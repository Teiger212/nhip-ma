import { describe, expect, test } from "vitest";

import { messageLine, sentLine, suggestionLine } from "./office-line";
import { NEW_THREAD, replyTemplate, templateTexts } from "./reply-template";
import type { Draft, GuestLanguage, Message, Qualification } from "./types";

/**
 * The operator line (#242, ADR 0007 as amended): which text an agent reads under an outgoing
 * one, with which label, and when there is none. Templates are rendered again in the office
 * language with no model call; a model draft's line is the office-language text it was written
 * with; a reply the agent edited or typed has none.
 */

const RENT_IN_TAY_HO: Qualification = {
	areaOfInterest: "Tây Hồ",
	nationality: null,
	inVietnamNow: null,
	rentOrBuy: "rent",
	timeframe: null,
	budgetBand: null,
	bedsOrHousehold: null,
};

const THREAD = { ...NEW_THREAD, officeName: "Hanoi Nest Seekers" };

function render(language: GuestLanguage): string {
	return replyTemplate(language, RENT_IN_TAY_HO, THREAD);
}

function templateDraft(language: GuestLanguage, officeReply?: string): Draft {
	return {
		reply: render(language),
		answersMessageId: "in-1",
		source: "template",
		...(officeReply ? { officeReply } : {}),
	};
}

const MODEL_DRAFT: Draft = {
	reply: "확인해 보고 이 채팅으로 다시 연락드리겠습니다.",
	answersMessageId: "in-1",
	source: "model",
	officeReply: "I'll check and get back to you here.",
};

function office(
	overrides: Partial<Pick<Message, "writtenBy" | "translations" | "direction">> = {},
): Pick<Message, "direction" | "writtenBy" | "translations"> {
	return { direction: "out", writtenBy: "template", translations: {}, ...overrides };
}

describe("the template's line is the same template in the office language", () => {
	test("a Korean reply in an English office carries the English template", () => {
		expect(templateTexts("ko", "en", RENT_IN_TAY_HO, THREAD)).toEqual({
			reply: render("ko"),
			officeReply: render("en"),
		});
	});

	test("in a Vietnamese office it carries the Vietnamese one", () => {
		expect(templateTexts("ko", "vi", RENT_IN_TAY_HO, THREAD).officeReply).toBe(render("vi"));
	});

	test("no line when the reply is already in the office language", () => {
		expect(templateTexts("en", "en", RENT_IN_TAY_HO, THREAD)).toEqual({ reply: render("en") });
		expect(templateTexts("vi", "vi", RENT_IN_TAY_HO, THREAD)).toEqual({ reply: render("vi") });
	});

	test("an unsupported guest language is answered in English, so an English office gets none (#245)", () => {
		// A French guest's reply language is English (ADR 0021 R4).
		expect(templateTexts("en", "en", RENT_IN_TAY_HO, THREAD).officeReply).toBeUndefined();
		expect(templateTexts("en", "vi", RENT_IN_TAY_HO, THREAD).officeReply).toBe(render("vi"));
	});
});

describe("under the reply box", () => {
	test("a template reads 'In ‹office language›'", () => {
		expect(suggestionLine(templateDraft("ko", render("en")), false, "en")).toEqual({
			text: render("en"),
			label: "inLanguage",
			language: "en",
		});
	});

	test("a model draft reads 'Translation'", () => {
		expect(suggestionLine(MODEL_DRAFT, false, "en")).toEqual({
			text: MODEL_DRAFT.officeReply,
			label: "translation",
			language: "en",
		});
	});

	test("the line goes once the agent types", () => {
		expect(suggestionLine(templateDraft("ko", render("en")), true, "en")).toBeNull();
		expect(suggestionLine(MODEL_DRAFT, true, "en")).toBeNull();
	});

	test("no line for a suggestion already in the office language", () => {
		expect(suggestionLine(templateDraft("en"), false, "en")).toBeNull();
	});
});

describe("what a sent reply keeps", () => {
	const sent = (draft: Draft, text: string, officeLanguage: "en" | "vi" = "en") =>
		sentLine({ draft, inboundId: "in-1", text, replyLanguage: "ko", officeLanguage, render });

	test("a template sent as suggested keeps the template rendered at send time", () => {
		expect(sent(templateDraft("ko", render("en")), render("ko"))).toEqual({
			writtenBy: "template",
			officeText: { locale: "en", text: render("en") },
		});
		// In the office language as it is when sent.
		expect(sent(templateDraft("ko", render("en")), render("ko"), "vi")?.officeText).toEqual({
			locale: "vi",
			text: render("vi"),
		});
	});

	test("a model draft sent as it was keeps the model's office-language text", () => {
		expect(sent(MODEL_DRAFT, MODEL_DRAFT.reply)).toEqual({
			writtenBy: "model",
			officeText: { locale: "en", text: MODEL_DRAFT.officeReply },
		});
	});

	test("an edited or typed reply keeps nothing", () => {
		expect(sent(templateDraft("ko", render("en")), `${render("ko")} 감사합니다.`)).toBeNull();
		expect(sent(MODEL_DRAFT, "제가 직접 쓴 답장입니다.")).toBeNull();
	});

	test("a suggestion written for another guest message keeps nothing", () => {
		const draft = { ...templateDraft("ko", render("en")), answersMessageId: "in-0" };
		expect(sent(draft, render("ko"))).toBeNull();
	});

	test("a template the thread has moved past keeps the line stored with it", () => {
		const stale = { ...templateDraft("ko"), reply: "안녕하세요.", officeReply: "Hello." };
		expect(sent(stale, "안녕하세요.")?.officeText).toEqual({ locale: "en", text: "Hello." });
	});

	test("a reply in the office language keeps who wrote it, and no line", () => {
		expect(
			sentLine({
				draft: templateDraft("en"),
				inboundId: "in-1",
				text: render("en"),
				replyLanguage: "en",
				officeLanguage: "en",
				render,
			}),
		).toEqual({ writtenBy: "template", officeText: null });
	});
});

describe("in the thread", () => {
	test("an office message shows its line in the office language, labelled by who wrote it", () => {
		expect(messageLine(office({ translations: { en: "Thanks." } }), "en", "ko")).toEqual({
			text: "Thanks.",
			label: "inLanguage",
			language: "en",
		});
		expect(
			messageLine(office({ writtenBy: "model", translations: { en: "Thanks." } }), "en", "ko")
				?.label,
		).toBe("translation");
	});

	test("after the office language changed, the line it was sent with, labelled with its language", () => {
		expect(messageLine(office({ translations: { en: "Thanks." } }), "vi", "ko")).toEqual({
			text: "Thanks.",
			label: "inLanguage",
			language: "en",
		});
	});

	test("none on a guest message, an office message without one, or a reply in the office language", () => {
		expect(
			messageLine(office({ direction: "in", translations: { en: "Hi." } }), "en", "ko"),
		).toBeNull();
		expect(messageLine(office({ writtenBy: null }), "en", "ko")).toBeNull();
		// A Vietnamese guest's reply, sent while the office read English, in an office now Vietnamese.
		expect(messageLine(office({ translations: { en: "Thanks." } }), "vi", "vi")).toBeNull();
	});
});
