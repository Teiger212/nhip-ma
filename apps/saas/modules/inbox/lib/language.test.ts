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

// The word list stays (ADR 0021) and keeps working once the letters narrow: "thuê nhà" read
// as Vietnamese on main only through ê and à, which are no longer Vietnamese letters.
test("a common word that ends in an accented letter is still a Vietnamese word", () => {
	// No decided letter here: ê and à are French too, so only the words can say Vietnamese.
	expect(detectLanguage("thuê nhà")).toBe("vi");
	expect(detectLanguage("giá?")).toBe("vi");
	expect(detectLanguage("Thuê")).toBe("vi");
});

test("a common word inside a longer word is not that word", () => {
	expect(detectLanguage("Anhalt")).toBe("en");
	expect(detectLanguage("ramua")).toBe("en");
});

// Some keyboards send a tone or a horn as its own combining mark (decomposed, NFD): "ơ" as
// o + U+031B. It is the same letter, so it reads the same.
test("decomposed Vietnamese reads as Vietnamese", () => {
	const camOn = "Ca\u0309m o\u031Bn"; // "Cảm ơn"
	const toiNguoiViet = "To\u0302i la\u0300 ngu\u031Bo\u031B\u0300i Vie\u0323\u0302t"; // "Tôi là người Việt"
	expect(camOn).not.toBe(camOn.normalize("NFC"));
	expect(detectLanguage(camOn)).toBe("vi");
	expect(detectLanguage(toiNguoiViet)).toBe("vi");
});

test("Korean, Japanese and Russian are read from their scripts", () => {
	expect(detectLanguage("안녕하세요")).toBe("ko");
	expect(detectLanguage("こんにちは")).toBe("ja");
	expect(detectLanguage("カタカナ")).toBe("ja");
	expect(detectLanguage("Здравствуйте")).toBe("ru");
});
