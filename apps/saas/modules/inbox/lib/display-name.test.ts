import { expect, test } from "vitest";

import { displayName, guestLabel } from "./display-name";

// rule: PRODUCT.md "A WhatsApp number is always read with its country code" (#94).
test("a nameless WhatsApp guest reads as their number with its country code, marked as a phone", () => {
	expect(guestLabel({ guestName: null, guestId: "12025550107", pipe: "whatsapp" })).toEqual({
		text: "+1 202 555 0107",
		phone: true,
	});
	expect(guestLabel({ guestName: null, guestId: "84912345678", pipe: "whatsapp" })).toEqual({
		text: "+84 912 345 678",
		phone: true,
	});
});

test("a named guest is their name, and a nameless Zalo guest their Zalo id, which is not a phone", () => {
	expect(guestLabel({ guestName: "Minji", guestId: "12025550107", pipe: "whatsapp" })).toEqual({
		text: "Minji",
		phone: false,
	});
	expect(guestLabel({ guestName: null, guestId: "5512345678901", pipe: "zalo" })).toEqual({
		text: "5512345678901",
		phone: false,
	});
});

test("the name written to the CRM stays the stored id", () => {
	expect(displayName({ guestName: null, guestId: "12025550107" })).toBe("12025550107");
});
