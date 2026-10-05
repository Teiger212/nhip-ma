import { expect, test } from "vitest";

import { detectLanguage } from "./language";

// CONTEXT.md "Guest language" and ADR 0021: VI is read only from letters Vietnamese alone
// uses, or its common words; anything unsure reads as EN.

test("French, Spanish and Portuguese accents read as English", () => {
	expect(detectLanguage("está disponible")).toBe("en");
	expect(detectLanguage("não")).toBe("en");
	expect(detectLanguage("à louer")).toBe("en");
});

test("â stays a Vietnamese letter, so French 'château' reads as Vietnamese (a known, accepted limit)", () => {
	expect(detectLanguage("château")).toBe("vi");
});

test("Vietnamese reads as Vietnamese, from its letters or its common words", () => {
	expect(detectLanguage("Tôi muốn thuê căn hộ")).toBe("vi");
	expect(detectLanguage("mua nhà")).toBe("vi");
	expect(detectLanguage("phòng")).toBe("vi");
});

test("Korean, Japanese and Russian are read from their scripts", () => {
	expect(detectLanguage("안녕하세요")).toBe("ko");
	expect(detectLanguage("こんにちは")).toBe("ja");
	expect(detectLanguage("カタカナ")).toBe("ja");
	expect(detectLanguage("Здравствуйте")).toBe("ru");
});
