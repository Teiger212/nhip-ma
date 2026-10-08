import { describe, expect, test } from "vitest";

import { extractFromInbound } from "./extract";
import type { ExtractFieldId } from "./extract-rows";
import { formatGuestDetail } from "./guest-details-format";
import { inboxEn, inboxVi } from "./test-translate";

/**
 * The guest details read in the office language (#243, #96; ADR 0025): the stored move-in,
 * budget, nationality and household put in words at render, in EN and VI. A value the formatter
 * doesn't know reads as stored, never empty. Scenarios: docs/e2e-scenarios.md, Guest details.
 */
const en = (id: ExtractFieldId, raw: string) => formatGuestDetail(id, raw, "en", inboxEn);
const vi = (id: ExtractFieldId, raw: string) => formatGuestDetail(id, raw, "vi", inboxVi);

describe("move-in reads as a phrase, not a date", () => {
	test.each([
		["на этой неделе", "This week", "Tuần này"],
		["tuần sau", "Next week", "Tuần sau"],
		["next month", "Next month", "Tháng sau"],
		["This Month", "This month", "Tháng này"],
		["this weekend", "This weekend", "Cuối tuần này"],
		["tomorrow", "Tomorrow", "Ngày mai"],
		["this Friday", "This Friday", "Thứ Sáu này"],
		["next sat", "Next Saturday", "Thứ Bảy tuần sau"],
		["in 3 weeks", "In 3 weeks", "3 tuần nữa"],
		["in 1 month", "In 1 month", "1 tháng nữa"],
		["early January", "Early January", "Đầu tháng 1"],
		["mid Sept", "Mid-September", "Giữa tháng 9"],
		["end of dec", "End of December", "Cuối tháng 12"],
		["1 Dec", "1 December", "Ngày 1 tháng 12"],
		["March 15", "15 March", "Ngày 15 tháng 3"],
		["in December", "In December", "Vào tháng 12"],
		["from March", "From March", "Từ tháng 3"],
		["đầu tháng 9", "Early September", "Đầu tháng 9"],
		["cuối tháng", "Late in the month", "Cuối tháng"],
		["tháng sau", "Next month", "Tháng sau"],
		["tháng 12", "In December", "Vào tháng 12"],
		["ngày 15", "On the 15th", "Ngày 15"],
		["ngày 2", "On the 2nd", "Ngày 2"],
		["다음 주", "Next week", "Tuần sau"],
		["이번 달", "This month", "Tháng này"],
		["이번 금요일", "This Friday", "Thứ Sáu này"],
		["来月", "Next month", "Tháng sau"],
		["今週", "This week", "Tuần này"],
		["в следующем месяце", "Next month", "Tháng sau"],
	])("%s reads %s / %s", (raw, english, vietnamese) => {
		expect(en("moveIn", raw)).toBe(english);
		expect(vi("moveIn", raw)).toBe(vietnamese);
	});

	test("a move-in it doesn't know reads as stored", () => {
		expect(en("moveIn", "after Tết")).toBe("after Tết");
		expect(vi("moveIn", "tháng 13")).toBe("tháng 13");
		expect(en("moveIn", "32 dec")).toBe("32 dec");
	});
});

describe("budget reads as an amount and a currency", () => {
	test.each([
		["$3500.", "$3,500", "3.500 USD"],
		["$3000/month", "$3,000 / month", "3.000 USD / tháng"],
		["$2000/month", "$2,000 / month", "2.000 USD / tháng"],
		["$2,800 / mo", "$2,800 / month", "2.800 USD / tháng"],
		["1200 dollars", "$1,200", "1.200 USD"],
		["USD 2.500", "$2,500", "2.500 USD"],
		["15 triệu", "15 million VND", "15 triệu đồng"],
		["30 triệu/tháng", "30 million VND / month", "30 triệu đồng / tháng"],
		["3 tỷ", "3 billion VND", "3 tỷ đồng"],
		["1,5 tỷ", "1.5 billion VND", "1,5 tỷ đồng"],
		["12 million", "12 million", "12 triệu"],
	])("%s reads %s / %s", (raw, english, vietnamese) => {
		expect(en("budget", raw)).toBe(english);
		expect(vi("budget", raw)).toBe(vietnamese);
	});

	test("a budget it doesn't know reads as stored", () => {
		expect(en("budget", "1,000–1,500 USD")).toBe("1,000–1,500 USD");
		expect(vi("budget", "$1,50,000")).toBe("$1,50,000");
	});
});

describe("nationality and household read in the office language", () => {
	test("each nationality the extractor knows has a name in both", () => {
		expect(en("nationality", "Russian")).toBe("Russian");
		expect(vi("nationality", "Russian")).toBe("Người Nga");
		expect(vi("nationality", "French")).toBe("Người Pháp");
		expect(vi("nationality", "Chinese")).toBe("Người Trung Quốc");
		expect(vi("nationality", "Martian")).toBe("Martian");
	});

	test.each([
		["3 bed, family of 4", "3 bed, family of 4", "3 phòng ngủ, gia đình 4 người"],
		["1 bed", "1 bed", "1 phòng ngủ"],
		["studio, couple", "studio, couple", "căn studio, cặp đôi"],
		["2 bed, 3 people, 1 kids", "2 bed, 3 people, 1 kid", "2 phòng ngủ, 3 người, 1 con"],
	])("%s reads %s / %s", (raw, english, vietnamese) => {
		expect(en("beds", raw)).toBe(english);
		expect(vi("beds", raw)).toBe(vietnamese);
	});

	test("a household piece it doesn't know stays as stored, beside the ones it does", () => {
		expect(vi("beds", "3 bed, a dog")).toBe("3 phòng ngủ, a dog");
	});

	test("other fields read as stored", () => {
		expect(vi("area", "Tây Hồ")).toBe("Tây Hồ");
	});
});

describe("the walk's guests read in words (stored values from their seeded messages)", () => {
	const shot = (text: string) => extractFromInbound(text).qualification;

	test("Bảo: next week, 15 million VND", () => {
		const q = shot(
			"Anh ơi, em cần thuê căn 1 phòng ngủ ở Hoàn Kiếm, ngân sách 15 triệu, tuần sau em dọn vào được không?",
		);
		expect(en("moveIn", q.timeframe!)).toBe("Next week");
		expect(en("budget", q.budgetBand!)).toBe("15 million VND");
		expect(vi("budget", q.budgetBand!)).toBe("15 triệu đồng");
		expect(vi("beds", q.bedsOrHousehold!)).toBe("1 phòng ngủ");
	});

	test("Arjun: in December, $3,500", () => {
		const q = shot(
			"Hello, I'm moving to Hanoi with my family of 4 in December. Need a 3 bedroom house to rent in Tay Ho, budget $3500.",
		);
		expect(en("moveIn", q.timeframe!)).toBe("In December");
		expect(vi("moveIn", q.timeframe!)).toBe("Vào tháng 12");
		expect(en("budget", q.budgetBand!)).toBe("$3,500");
		expect(vi("beds", q.bedsOrHousehold!)).toBe("3 phòng ngủ, gia đình 4 người");
	});
});
