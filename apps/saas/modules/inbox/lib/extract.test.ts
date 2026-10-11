import { describe, expect, test } from "vitest";

import { formatCribNote } from "./crib";
import { oneShot } from "./draft";
import { extractFromInbound, PAPERWORK_FLAG } from "./extract";
import { ENGLISH_REPLY_LINE } from "./greeting";
import { NEW_THREAD } from "./reply-template";
import { inboxEn as en, inboxVi as vi } from "./test-translate";

test("full English inbound extracts fields that are present", () => {
	const text =
		"Hi, I'm Japanese, currently in Hanoi for 2 weeks. Looking to rent a 2-bedroom in Tay Ho, budget around $1500/month.";
	const got = extractFromInbound(text);
	expect(got.language).toBe("en");
	expect(got.qualification.areaOfInterest).toBe("Tây Hồ");
	expect(got.qualification.nationality).toBe("Japanese");
	expect(got.qualification.inVietnamNow).toBe(true);
	expect(got.qualification.rentOrBuy).toBe("rent");
	expect(got.qualification.timeframe).toBeNull();
	expect(got.qualification.budgetBand ?? "").toMatch(/1500/);
	expect(got.qualification.bedsOrHousehold).toBe("2 bed");
	// "In Hanoi for 2 weeks" is where the guest is now, not how long they want to stay (#317).
	expect(got.qualification.stayLength).toBeNull();
	expect(got.paperwork.mentioned).toBe(false);
	expect(got.paperwork.flag).toBeNull();
});

test("missing fields stay missing", () => {
	const got = extractFromInbound("Interested in buying");
	expect(got.qualification.rentOrBuy).toBe("buy");
	expect(got.qualification.timeframe).toBeNull();
	expect(got.qualification.areaOfInterest).toBeNull();
	expect(got.qualification.nationality).toBeNull();
	expect(got.qualification.inVietnamNow).toBeNull();
	expect(got.qualification.budgetBand).toBeNull();
	expect(got.qualification.bedsOrHousehold).toBeNull();
	expect(got.qualification.stayLength).toBeNull();
});

test("move-in timeframe is taken from inbound only", () => {
	const friday = extractFromInbound(
		"I am Korean, currently in Hanoi. Looking to rent in Tay Ho this Friday.",
	);
	expect(friday.qualification.rentOrBuy).toBe("rent");
	expect(friday.qualification.timeframe).toBe("this Friday");

	const month = extractFromInbound(
		"Can foreigners get a pink book if we buy in Tay Ho next month?",
	);
	expect(month.qualification.rentOrBuy).toBe("buy");
	expect(month.qualification.timeframe).toBe("next month");

	const vn = extractFromInbound("Em muốn thuê căn 2 ngủ ở Tây Hồ từ đầu tháng 9");
	expect(vn.qualification.timeframe).toBe("đầu tháng 9");
});

test("Vietnamese inbound is first-class", () => {
	const got = extractFromInbound("Em muốn thuê căn 2 ngủ ở Tây Hồ, ngân sách 30 triệu");
	expect(got.language).toBe("vi");
	expect(got.qualification.areaOfInterest).toBe("Tây Hồ");
	expect(got.qualification.rentOrBuy).toBe("rent");
	expect(got.qualification.timeframe).toBeNull();
	expect(got.qualification.budgetBand ?? "").toMatch(/30/);
	expect(got.qualification.bedsOrHousehold).toBe("2 bed");
});

test("decomposed Vietnamese inbound is read like the same text composed", () => {
	// "Em muốn thuê căn 2 ngủ ở Tây Hồ", each tone and horn sent as its own combining mark (NFD).
	const decomposed =
		"Em muo\u0302\u0301n thue\u0302 ca\u0306n 2 ngu\u0309 o\u031B\u0309 Ta\u0302y Ho\u0302\u0300 tu\u031B\u0300 \u0111a\u0302\u0300u tha\u0301ng 9";
	expect(decomposed).not.toBe(decomposed.normalize("NFC"));
	const got = extractFromInbound(decomposed);
	expect(got.language).toBe("vi");
	expect(got.qualification.areaOfInterest).toBe("Tây Hồ");
	expect(got.qualification.rentOrBuy).toBe("rent");
	expect(got.qualification.bedsOrHousehold).toBe("2 bed");
	expect(got.qualification.timeframe).toBe("đầu tháng 9");
});

test("paperwork flag does not invent Vietnamese law", () => {
	const shot = oneShot("Can foreigners get a pink book if we buy in Tay Ho next month?");
	expect(shot.paperwork.mentioned).toBe(true);
	expect(shot.paperwork.flag).toBe(PAPERWORK_FLAG);
	expect(shot.paperwork.flag ?? "").toMatch(/Do not invent Vietnamese law/);
	expect(shot.draft.reply).not.toMatch(/tomorrow/i);
	expect(shot.draft.reply).not.toMatch(/you (can|will) (get|receive) a pink book/i);
	// The operator sees the flag in the guest details (#248), in their language.
	expect(en("paperworkFlag")).toMatch(/Do not invent Vietnamese law/);
	expect(formatCribNote(shot, en)).not.toMatch(/sổ hồng ngày mai/i);
});

const JAPANESE = "ハノイにいます。Tay Hoで賃貸を探しています。";

test("draft follows guest language; the operator note follows the operator's language", () => {
	const enGuest = oneShot("Looking to rent in Ba Dinh, I am French");
	expect(enGuest.language).toBe("en");
	expect(enGuest.draft.reply).toMatch(/Ba Đình|renting/i);
	expect(formatCribNote(enGuest, vi)).toMatch(/tiếng Anh/);
	expect(formatCribNote(enGuest, en)).toMatch(/English/);

	const viGuest = oneShot("Tôi muốn mua nhà ở Ba Đình");
	expect(viGuest.language).toBe("vi");
	expect(viGuest.draft.reply).toMatch(/mua|Ba Đình/);
	expect(formatCribNote(viGuest, en)).toMatch(/Vietnamese/);

	// With the gate open to Japanese (#306), as before it.
	const jaGuest = oneShot(JAPANESE, null, NEW_THREAD, undefined, ["en", "vi", "ja"]);
	expect(jaGuest.language).toBe("ja");
	expect(jaGuest.draft.reply).toMatch(/チャット/);
	expect(jaGuest.draft.reply).not.toContain(ENGLISH_REPLY_LINE.en);
	expect(formatCribNote(jaGuest, vi)).toBe("bằng tiếng Nhật");
});

// #306: until after the demo Nhịp replies in EN and VI only. A guest in another of the five is
// answered in English, told so once, and the operator note says the reply is in English.
test("by default a Japanese guest is answered in English, with the English-reply line", () => {
	const shot = oneShot(JAPANESE);
	expect(shot.language).toBe("en");
	expect(shot.guestLanguage).toBe("ja");
	expect(shot.draft.reply).toMatch(/^Thanks for getting in touch\./u);
	expect(shot.draft.reply.endsWith(`\n\n${ENGLISH_REPLY_LINE.en}`)).toBe(true);
	expect(formatCribNote(shot, en)).toBe("in English · Japanese isn't supported");
	expect(formatCribNote(shot, vi)).toBe("bằng tiếng Anh · chưa hỗ trợ tiếng Nhật");
});

test("a French guest is answered in English without the line, as before (#245)", () => {
	const shot = oneShot("Bonjour, je cherche un appartement à louer à Tay Ho");
	expect(shot.language).toBe("en");
	expect(shot.guestLanguage).toBe("fr");
	expect(shot.draft.reply).not.toContain(ENGLISH_REPLY_LINE.en);
});

/* The extraction slips found on the demo walk, 2026-10-08 (#243). */

test("a budget at the end of a sentence keeps no full stop (#243)", () => {
	const q = extractFromInbound(
		"Need a 3 bedroom house to rent in Tay Ho, budget $3500.",
	).qualification;
	expect(q.budgetBand).toBe("$3500");
	expect(extractFromInbound("Budget 15 triệu, tuần sau.").qualification.budgetBand).toBe(
		"15 triệu",
	);
	expect(extractFromInbound("Budget $3,000/month.").qualification.budgetBand).toBe("$3,000/month");
});

test("“in December” and “from March” are read as the move-in (#243)", () => {
	const arjun = extractFromInbound(
		"Hello, I'm moving to Hanoi with my family of 4 in December. Need a 3 bedroom house to rent in Tay Ho, budget $3500.",
	);
	expect(arjun.qualification.timeframe).toBe("in December");
	expect(extractFromInbound("We'd lease from March.").qualification.timeframe).toBe("from March");
	// A day of the month is still the more precise read.
	expect(extractFromInbound("Lease from 1 Dec, budget $2000.").qualification.timeframe).toBe(
		"1 Dec",
	);
	// A word that starts like a month is not one.
	expect(
		extractFromInbound("A flat in decent condition, in market areas.").qualification.timeframe,
	).toBeNull();
});

test("a day the guest wants to view on is not the move-in (#243)", () => {
	const claire = extractFromInbound(
		"Bonjour, je suis française. Je cherche un 3 bedroom to rent à Ba Dinh, budget $3000/month.\nOui, merci ! Photos please, and is a viewing possible this Saturday?",
	);
	expect(claire.qualification.timeframe).toBeNull();
	const olga = extractFromInbound(
		"Добрый день! Мы семья из России, family of 4, ищем аренду в Ecopark, 3 bedroom, на этой неделе хотим посмотреть.",
	);
	expect(olga.qualification.timeframe).toBeNull();
	expect(extractFromInbound("Có thể xem nhà tuần sau không?").qualification.timeframe).toBeNull();
	expect(extractFromInbound("来週見学できますか？").qualification.timeframe).toBeNull();
});

test("a viewing in another clause doesn't hide the real move-in (#243)", () => {
	expect(
		extractFromInbound("Moving in December, can we view next week?").qualification.timeframe,
	).toBe("in December");
	expect(
		extractFromInbound("Can I visit this Saturday? We move in next month.").qualification.timeframe,
	).toBe("next month");
	expect(
		extractFromInbound("Is a viewing possible this Saturday?\nWe'd move in next Saturday.")
			.qualification.timeframe,
	).toBe("next Saturday");
});

test("“française” reads as French (#243)", () => {
	expect(extractFromInbound("Bonjour, je suis française.").qualification.nationality).toBe(
		"French",
	);
	expect(extractFromInbound("Je suis français.").qualification.nationality).toBe("French");
	// A Korean company doesn't make the guest Korean (left as it is).
	expect(extractFromInbound("한국 회사 주재원입니다.").qualification.nationality).toBeNull();
});

/*
 * Stay length (#317, CONTEXT.md "Stay length"): how long the guest wants to stay, from their own
 * words only, stored in English like the household and read in the office language at render.
 */
describe("stay length is the guest's own words, never inferred (#317)", () => {
	const stay = (text: string) => extractFromInbound(text).qualification.stayLength;

	test.each([
		// English.
		["Tay Ho에서 3 nights vs monthly stay 고민이에요.", "3 nights or monthly"],
		["need a studio to rent near Cau Giay for 6 months from mid November", "6 months"],
		["We'd rent for 6-12 months", "6–12 months"],
		["for 6 to 12 months", "6–12 months"],
		["Need it for a year", "1 year"],
		["a 12-month lease please", "12 months"],
		["a one-year contract", "1 year"],
		["just a 3-night stay", "3 nights"],
		["looking for a monthly rental", "monthly"],
		["month-to-month is best", "monthly"],
		// Vietnamese.
		["Em muốn thuê 6 tháng ở Tây Hồ", "6 months"],
		["ở 3 đêm hay thuê theo tháng", "3 nights or monthly"],
		["hợp đồng 1 năm", "1 year"],
		["thuê trong 6-12 tháng", "6–12 months"],
		// Korean.
		["3박 4일 있을 거예요", "3 nights"],
		["6개월 정도 살 예정이에요", "6 months"],
		["1년 계약 원해요", "1 year"],
		["한 달 살기", "1 month"],
		// Japanese.
		["3泊したいです", "3 nights"],
		["6ヶ月住みたい", "6 months"],
		["1年間の予定です", "1 year"],
		["マンスリーマンションを探しています", "monthly"],
		// Russian.
		["Ищу квартиру на 6 месяцев", "6 months"],
		["на год", "1 year"],
		["на 3 ночи", "3 nights"],
		["помесячно", "monthly"],
	])("%s → %s", (text, expected) => {
		expect(stay(text)).toBe(expected);
	});

	test.each([
		// A budget per month is a price, not a stay.
		"Budget $1500/month",
		"budget around $1,500 a month",
		"khoảng 12 triệu một tháng",
		"1200 USD/tháng",
		"до $1000 в месяц",
		// "Monthly rent" is mostly a price; 월세 is a kind of lease, not a length.
		"what's the monthly rent?",
		"Long Bien에서 2 bedroom 월세 찾고 있어요",
		// A move-in, a date or a year is not a stay.
		"I'd like to move in 3 weeks",
		"3개월 후에 입주",
		"3ヶ月後に引っ越します",
		"через 2 недели",
		"từ ngày 15 tháng 12",
		"Em cần nhà trong 2 tuần tới",
		"Em đã ở đây trong 1 năm qua",
		"2026년 계약",
		"2026年",
		// Where the guest is now, or a deposit, is not a stay.
		"I'm in Hanoi for 2 weeks",
		"đang ở Hà Nội 2 tuần",
		"Я сейчас в Ханое на 2 недели",
		"deposit of 2 months",
		// A bare count names nothing.
		"Hello, 2 bedroom in Tay Ho",
	])("%s has no stay length", (text) => {
		expect(stay(text)).toBeNull();
	});

	test("every length named, in the order written, once each", () => {
		expect(stay("3 nights first.\nOr maybe a monthly stay, 3 nights at least")).toBe(
			"3 nights or monthly",
		);
	});

	test("stay length is separate from the move-in", () => {
		const q = extractFromInbound("Moving in next month, for 1 year.").qualification;
		expect(q.timeframe).toBe("next month");
		expect(q.stayLength).toBe("1 year");
	});
});

test("one-shot is not an interviewer", () => {
	const shot = oneShot("Hello");
	expect(shot.draft.reply).not.toMatch(/what is your budget/i);
	expect(shot.draft.reply).not.toMatch(/how many bedrooms/i);
	expect(shot.draft.reply).not.toMatch(/are you in vietnam/i);
	expect(shot.draft.reply).not.toMatch(/nationality/i);
});
