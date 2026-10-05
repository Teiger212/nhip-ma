import { expect, test } from "vitest";

import { maskContactDetails } from "./mask-note";

/**
 * A deletion receipt names no guest (ADR 0020), so the manager's note has its phone numbers
 * and emails masked before it is stored.
 */

test.each([
	["a Vietnamese mobile", "Khách gọi từ 0912 345 678 xin xóa", "Khách gọi từ [phone] xin xóa"],
	["a mobile written with dots", "SĐT 0912.345.678", "SĐT [phone]"],
	["a mobile with no spaces", "number 0987654321 asked", "number [phone] asked"],
	["+84 with spaces", "asked via +84 912 345 678.", "asked via [phone]."],
	["84 without the plus", "Zalo 84912345678", "Zalo [phone]"],
	["a Ho Chi Minh City landline", "office (028) 3822 1234 called", "office [phone] called"],
	["a US number", "call +1 (415) 555-0123 back", "call [phone] back"],
	["a UK number", "+44 20 7946 0958", "[phone]"],
	["a Korean mobile", "Minji's 010-1234-5678", "Minji's [phone]"],
	["a Zalo user id", "zalo id 4381927364519283746", "zalo id [phone]"],
])("masks %s", (_kind, note, masked) => {
	expect(maskContactDetails(note)).toBe(masked);
});

test.each([
	["an email", "wrote from hoa.nguyen@gmail.com", "wrote from [email]"],
	["an email with a plus and a subdomain", "a+b@mail.example.co.uk asked", "[email] asked"],
	[
		"two of each",
		"a@b.vn, 0912345678; c@d.com / +84 987 654 321",
		"[email], [phone]; [email] / [phone]",
	],
])("masks %s", (_kind, note, masked) => {
	expect(maskContactDetails(note)).toBe(masked);
});

test("leaves a note with no contact details as it is", () => {
	const note = "Duplicate of the 2 bedroom lead from last week; 500 USD budget, ticket 1234.";
	expect(maskContactDetails(note)).toBe(note);
});
