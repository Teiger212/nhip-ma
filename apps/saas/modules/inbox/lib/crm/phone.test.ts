import { expect, test } from "vitest";

import { guestPhone, toE164 } from "./phone";

test("phone numbers in the shapes offices store them meet at one E.164", () => {
	for (const raw of [
		"+84901234567",
		"84901234567",
		"0901234567",
		"090 123 4567",
		"+84 90-123-4567",
		"(+84) 901.234.567",
	]) {
		expect(toE164(raw)).toBe("+84901234567");
	}
	expect(toE164("+82 10-1234-5678")).toBe("+821012345678");
	expect(toE164("821012345678")).toBe("+821012345678");
});

test("anything that is not a phone number is not one", () => {
	for (const raw of ["", "demo-ko-stay", "12345", "+1234567890123456", "abc0901234567"]) {
		expect(toE164(raw)).toBeNull();
	}
});

test("only a WhatsApp guest id is a phone; a Zalo id never is", () => {
	expect(guestPhone({ pipe: "whatsapp", guestId: "84901234567" })).toBe("+84901234567");
	expect(guestPhone({ pipe: "zalo", guestId: "84901234567" })).toBeNull();
	expect(guestPhone({ pipe: "whatsapp", guestId: "demo-ko-stay" })).toBeNull();
});
