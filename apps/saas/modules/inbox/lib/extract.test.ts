import { expect, test } from "vitest";

import { formatCribNote } from "./crib";
import { oneShot } from "./draft";
import { extractFromInbound, PAPERWORK_FLAG } from "./extract";
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

	const jaGuest = oneShot("ハノイにいます。Tay Hoで賃貸を探しています。");
	expect(jaGuest.language).toBe("ja");
	expect(jaGuest.draft.reply).toMatch(/チャット/);
	expect(formatCribNote(jaGuest, vi)).toMatch(/tiếng Nhật/);
});

test("one-shot is not an interviewer", () => {
	const shot = oneShot("Hello");
	expect(shot.draft.reply).not.toMatch(/what is your budget/i);
	expect(shot.draft.reply).not.toMatch(/how many bedrooms/i);
	expect(shot.draft.reply).not.toMatch(/are you in vietnam/i);
	expect(shot.draft.reply).not.toMatch(/nationality/i);
});
