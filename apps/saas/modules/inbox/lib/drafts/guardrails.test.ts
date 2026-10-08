import { describe, expect, test } from "vitest";

import { checkFollowUp, parseModelDraft } from "./guardrails";

/**
 * The post-check behind the model (ADR 0024): it blocks an answer, never a mention. A stated
 * price, availability, viewing time or legal answer is dropped, and so is a number the guest
 * didn't write. A deferral ("I'll check…") and a question pass. A dropped draft leaves the
 * template in the reply box.
 */

describe("in English", () => {
	const guest = ["Hi! Is it $2,000 a month? Can I view it this weekend? Can foreigners own it?"];

	test("a stated price is blocked, even at the guest's own figure", () => {
		expect(checkFollowUp("Yes, the rent is $2,000 a month.", guest)).toBeNull();
		expect(checkFollowUp("It costs $2,000 a month, utilities included.", guest)).toBeNull();
	});

	test("a stated availability is blocked", () => {
		expect(checkFollowUp("Good news, the apartment is still available.", guest)).toBeNull();
		expect(checkFollowUp("I have a lovely place in Tây Hồ for you.", guest)).toBeNull();
	});

	test("a stated viewing time is blocked", () => {
		expect(checkFollowUp("You can view it on Saturday morning.", guest)).toBeNull();
		expect(checkFollowUp("Happy to show you around. Sunday works for us.", guest)).toBeNull();
	});

	test("a stated legal answer is blocked", () => {
		expect(checkFollowUp("Foreigners can own it, no problem.", guest)).toBeNull();
		expect(checkFollowUp("You will get a sổ hồng, no problem.", guest)).toBeNull();
	});

	test("a number the guest didn't write is blocked, even in a deferral or a question", () => {
		expect(checkFollowUp("I'll send three options under $3,000 shortly.", guest)).toBeNull();
		expect(checkFollowUp("I'll check whether 3pm suits the owner.", guest)).toBeNull();
		expect(checkFollowUp("Would a 12-month lease work for you?", guest)).toBeNull();
		expect(checkFollowUp("The rent is $2,000, I'll confirm.", ["Is it 2,000?"])).toBeNull();
	});

	test("a number the guest wrote passes, however it is written", () => {
		const draft = "I'll pull together a few options in Tây Hồ around $2,800.";
		expect(checkFollowUp(draft, ["Looking in Tay Ho, budget $2,800"])).toBe(draft);
		expect(checkFollowUp(draft, ["budget around 2800 usd"])).toBe(draft);
		expect(checkFollowUp(draft, ["budget 2.8k"])).toBe(draft);
		// Full-width digits read as the digits they are.
		expect(checkFollowUp(draft, ["予算は２８００ドルです"])).toBe(draft);
	});

	test("a mention passes: a deferral, an acknowledgement, a question", () => {
		for (const draft of [
			"I'll check the ownership rules for you.",
			"Thanks for asking about the pink book. I'll confirm the details and come back to you.",
			"I'll find out whether it's still available and get back to you here.",
			"Let me check the viewing slots with the owner.",
			"When would you like to see it?",
			"Are you looking to rent or to buy?",
		]) {
			expect(checkFollowUp(draft, guest), draft).toBe(draft);
		}
	});

	test('"a viewing on Friday" is now blocked: it states a viewing day', () => {
		expect(
			checkFollowUp("Happy to arrange a viewing on Friday. Which time suits you?", guest),
		).toBeNull();
		// A question that names a viewing day proposes one: blocked too.
		expect(checkFollowUp("Would Friday work for a viewing?", guest)).toBeNull();
	});
});

describe("in Vietnamese", () => {
	const guest = [
		"Chào em, căn này giá thuê 20 triệu phải không? Còn trống không? Cuối tuần xem nhà được không? Người nước ngoài có được sở hữu không?",
	];

	test("a stated price is blocked, even at the guest's own figure", () => {
		expect(checkFollowUp("Dạ, giá thuê là 20 triệu một tháng ạ.", guest)).toBeNull();
	});

	test("a stated availability is blocked", () => {
		expect(checkFollowUp("Dạ, căn này vẫn còn trống ạ.", guest)).toBeNull();
	});

	test("a stated viewing time is blocked", () => {
		expect(checkFollowUp("Anh/chị có thể xem nhà vào thứ Bảy ạ.", guest)).toBeNull();
	});

	test("a stated legal answer is blocked", () => {
		expect(checkFollowUp("Anh/chị sẽ được sở hữu căn hộ.", guest)).toBeNull();
		expect(checkFollowUp("Người nước ngoài được mua căn hộ này ạ.", guest)).toBeNull();
	});

	test("a number the guest didn't write is blocked", () => {
		expect(checkFollowUp("Em sẽ gửi anh/chị 3 căn phù hợp ạ.", guest)).toBeNull();
		expect(checkFollowUp("Em sẽ kiểm tra căn 25 triệu cho anh/chị ạ.", guest)).toBeNull();
	});

	test("a number the guest wrote passes, however it is written", () => {
		const draft = "Em sẽ chọn vài căn khoảng 20 triệu ở Tây Hồ và gửi anh/chị ạ.";
		expect(checkFollowUp(draft, guest)).toBe(draft);
		expect(checkFollowUp(draft, ["ngân sách 20tr"])).toBe(draft);
		const billions = "Em sẽ tìm vài căn khoảng 3.500.000.000 đồng ạ.";
		expect(checkFollowUp(billions, ["tầm 3,5 tỷ"])).toBe(billions);
	});

	test("a mention passes: a deferral, a question", () => {
		for (const draft of [
			"Em sẽ kiểm tra quy định về sở hữu cho anh/chị ạ.",
			"Dạ, em sẽ xác nhận giá thuê với chủ nhà rồi báo lại anh/chị ạ.",
			"Anh/chị muốn xem nhà vào thời gian nào ạ?",
		]) {
			expect(checkFollowUp(draft, guest), draft).toBe(draft);
		}
	});
});

test("a paperwork answer in another guest language is blocked; a deferral about it passes", () => {
	expect(checkFollowUp("소유권은 문제 없습니다.", [])).toBeNull();
	expect(checkFollowUp("소유권 관련 내용은 확인 후 다시 연락드리겠습니다.", [])).toBe(
		"소유권 관련 내용은 확인 후 다시 연락드리겠습니다.",
	);
});

// ADR 0021, R2: the model's text is checked as the guest would read it. A model can send
// Vietnamese decomposed (a base letter, then its marks), which reads the same on a phone.

test("a decomposed paperwork answer is caught like the composed one", () => {
	const decomposed = "Anh/chị sẽ được sở hữu căn hộ.".normalize("NFD");
	expect(decomposed).not.toBe(decomposed.normalize("NFC"));
	expect(checkFollowUp(decomposed, [])).toBeNull();
});

test("a draft that passes is stored composed", () => {
	const draft = "Cảm ơn anh/chị, bên em sẽ gửi thêm thông tin ạ.";
	expect(checkFollowUp(draft.normalize("NFD"), [])).toBe(draft.normalize("NFC"));
});

test("an empty or overlong draft is dropped", () => {
	expect(checkFollowUp("", [])).toBeNull();
	expect(checkFollowUp(null, [])).toBeNull();
	expect(checkFollowUp("x".repeat(601), [])).toBeNull();
});

describe("the model's JSON", () => {
	test("both texts are read from strict JSON", () => {
		expect(
			parseModelDraft('{"reply":"Dạ em sẽ kiểm tra ạ.","office_reply":"I\'ll check."}'),
		).toEqual({ reply: "Dạ em sẽ kiểm tra ạ.", officeReply: "I'll check." });
		// One code fence around the object is how models often send JSON: it's read through.
		expect(parseModelDraft('```json\n{"reply":"A.","office_reply":"B."}\n```')).toEqual({
			reply: "A.",
			officeReply: "B.",
		});
	});

	test("anything else is malformed, and the template stands", () => {
		for (const raw of [
			null,
			"Thanks, I'll check.",
			'{"reply":"A."}',
			'{"reply":"A.","office_reply":""}',
			'{"reply":"A.","office_reply":"B.","note":"extra"}',
			'{"reply":1,"office_reply":"B."}',
			'Sure! {"reply":"A.","office_reply":"B."}',
			'["A.","B."]',
		]) {
			expect(parseModelDraft(raw), String(raw)).toBeNull();
		}
	});
});
