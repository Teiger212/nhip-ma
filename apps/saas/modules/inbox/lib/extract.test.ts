import { expect, test } from "vitest";

import { formatCribNotes } from "./crib";
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

test("paperwork flag does not invent Vietnamese law", () => {
	const shot = oneShot("Can foreigners get a pink book if we buy in Tay Ho next month?");
	expect(shot.paperwork.mentioned).toBe(true);
	expect(shot.paperwork.flag).toBe(PAPERWORK_FLAG);
	expect(shot.paperwork.flag ?? "").toMatch(/Do not invent Vietnamese law/);
	expect(shot.draft.reply).not.toMatch(/tomorrow/i);
	expect(shot.draft.reply).not.toMatch(/you (can|will) (get|receive) a pink book/i);
	expect(formatCribNotes(shot, en)).toMatch(/Do not invent Vietnamese law/);
	expect(formatCribNotes(shot, en)).not.toMatch(/sổ hồng ngày mai/i);
});

test("draft follows guest language; the operator note follows the operator's language", () => {
	const enGuest = oneShot("Looking to rent in Ba Dinh, I am French");
	expect(enGuest.language).toBe("en");
	expect(enGuest.draft.reply).toMatch(/Ba Đình|renting/i);
	expect(formatCribNotes(enGuest, vi)).toMatch(/French|Ba Đình|thuê/i);
	expect(formatCribNotes(enGuest, en)).toMatch(/French|Ba Đình|rent/i);

	const viGuest = oneShot("Tôi muốn mua nhà ở Ba Đình");
	expect(viGuest.language).toBe("vi");
	expect(viGuest.draft.reply).toMatch(/mua|Ba Đình/);
	expect(formatCribNotes(viGuest, en)).toMatch(/Vietnamese/);

	const jaGuest = oneShot("ハノイにいます。Tay Hoで賃貸を探しています。");
	expect(jaGuest.language).toBe("ja");
	expect(jaGuest.draft.reply).toMatch(/チャット/);
	expect(formatCribNotes(jaGuest, vi)).toMatch(/tiếng Nhật/);
});

test("one-shot is not an interviewer", () => {
	const shot = oneShot("Hello");
	expect(shot.draft.reply).not.toMatch(/what is your budget/i);
	expect(shot.draft.reply).not.toMatch(/how many bedrooms/i);
	expect(shot.draft.reply).not.toMatch(/are you in vietnam/i);
	expect(shot.draft.reply).not.toMatch(/nationality/i);
});
