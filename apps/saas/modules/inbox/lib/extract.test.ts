import { expect, test } from "vitest";

import { oneShot } from "./draft";
import { extractFromInbound, PAPERWORK_FLAG } from "./extract";

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
	expect(shot.draft.crib).not.toMatch(/sổ hồng ngày mai/i);
});

test("draft follows guest language and crib is VN or EN", () => {
	const en = oneShot("Looking to rent in Ba Dinh, I am French");
	expect(en.language).toBe("en");
	expect(en.draft.reply).toMatch(/Ba Đình|renting/i);
	expect(en.draft.cribLanguage).toBe("vi");
	expect(en.draft.crib).toMatch(/French|Ba Đình|thuê/i);

	const vi = oneShot("Tôi muốn mua nhà ở Ba Đình");
	expect(vi.language).toBe("vi");
	expect(vi.draft.reply).toMatch(/mua|Ba Đình/);
	expect(vi.draft.cribLanguage).toBe("en");

	const ja = oneShot("ハノイにいます。Tay Hoで賃貸を探しています。");
	expect(ja.language).toBe("ja");
	expect(ja.draft.reply).toMatch(/チャット/);
	expect(ja.draft.cribLanguage).toBe("vi");
});

test("one-shot is not an interviewer", () => {
	const shot = oneShot("Hello");
	expect(shot.draft.reply).not.toMatch(/what is your budget/i);
	expect(shot.draft.reply).not.toMatch(/how many bedrooms/i);
	expect(shot.draft.reply).not.toMatch(/are you in vietnam/i);
	expect(shot.draft.reply).not.toMatch(/nationality/i);
});
