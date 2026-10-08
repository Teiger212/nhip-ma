import { expect, test } from "vitest";

import { detectLanguage, identifyLanguage } from "./language";

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

// #245, ADR 0021 R4 as amended: the guest language is named, whatever it is, with no model
// call. The five keep their reading exactly; anything unsure is still English.

const CLAIRE_FIRST =
	"Bonjour, je suis française. Je cherche un 3 bedroom to rent à Ba Dinh, budget $3000/month.";
const CLAIRE_SECOND = "Oui, merci ! Photos please, and is a viewing possible this Saturday?";

test.each([
	[
		"French",
		"fr",
		"Je cherche un appartement de deux chambres à Tay Ho, budget 1500 dollars par mois.",
	],
	["Spanish", "es", "Hola, busco un apartamento de dos habitaciones en Tay Ho para alquilar."],
	["Portuguese", "pt", "Olá, estou procurando um apartamento para alugar em Tay Ho, dois quartos."],
	["German", "de", "Hallo, ich suche eine Wohnung mit zwei Schlafzimmern in Tay Ho zur Miete."],
	["Chinese", "zh", "你好，我想在西湖附近租一套两居室的公寓。"],
	[
		"Chinese mixed with English",
		"zh",
		"你好！我是 Chinese，想在 Times City rent 一套 3 bedroom 公寓，预算 $2200/month，next week 可以看房吗？",
	],
	["French mixed with English (Claire's first message)", "fr", CLAIRE_FIRST],
])("%s is named", (_, code, text) => {
	expect(identifyLanguage(text)).toBe(code);
});

test("a lone greeting names its language", () => {
	expect(identifyLanguage("Bonjour")).toBe("fr");
	expect(identifyLanguage("Hola")).toBe("es");
});

// Claire's second message is mostly English: alone it reads English, but her thread, all her
// messages together, is French, so the thread keeps naming French (ADR 0021, #245).
test("a mostly English line reads English alone, and a French guest's thread stays French", () => {
	expect(identifyLanguage(CLAIRE_SECOND)).toBe("en");
	expect(identifyLanguage(`${CLAIRE_FIRST}\n${CLAIRE_SECOND}`)).toBe("fr");
});

test.each([
	[
		"English",
		"en",
		"Hello, I'm looking for a 2 bedroom apartment in West Lake, budget around $1500/month.",
	],
	["Vietnamese", "vi", "Chào anh chị, em cần thuê căn hộ 3 phòng ngủ ở Ciputra"],
	["Japanese", "ja", "はじめまして。日本人です。Cau Giayで3 bedroomの賃貸を探しています。"],
	["Korean", "ko", "안녕하세요, 한국인입니다. Long Bien에서 2 bedroom 월세 찾고 있어요."],
	["Russian", "ru", "Здравствуйте! Ищу квартиру в аренду, Hai Ba Trung, 1 bedroom."],
])("%s, a supported language, reads as before", (_, code, text) => {
	expect(identifyLanguage(text)).toBe(code);
	expect(detectLanguage(text)).toBe(code);
});

// Most guests write English, and short: none of these may be named as anything else.
test.each([
	"Hi",
	"ok thanks",
	"yes",
	"Is it available?",
	"Photos please",
	"2BR Tay Ho 1500",
	"What about parking?",
	"Can I see it this Saturday?",
	"Hello, I'm Daniel. Looking to rent a 1 bedroom in Hoan Kiem, under $800.",
	"Danke, but I need something bigger",
	// Place and person names are no language: the library alone read these as it, nl, de or es.
	"Studio in Tay Ho",
	"Villa in Tay Ho",
	"Any studio in Tay Ho?",
	"Rent in Tay Ho",
	"Studio in Ba Dinh?",
	"Villa in Ciputra, 4 bedrooms",
	"Hi, villa in Ciputra?",
	"Studio Ciputra 700",
	"Lotte area",
	"2BR in Ba Dinh",
	"Flat in Hoan Kiem",
	"My name is Jan de Vries",
	"Hai Ba Trung",
	"Villa Ecopark",
	"Hello from Juan Carlos",
])("short English stays English: %s", (text) => {
	expect(identifyLanguage(text)).toBe("en");
});

test.each([
	"toi muon thue can ho 2 phong ngu o Tay Ho",
	"cho em hoi gia thue bao nhieu a",
	"chi oi can ho nay con trong khong",
])("unaccented Vietnamese is still unsure, so English, as before: %s", (text) => {
	expect(identifyLanguage(text)).toBe("en");
});

test.each([
	["Arabic", "ar", "مرحبا، أبحث عن شقة في هانوي"],
	["Hebrew", "he", "שלום, אני מחפש דירה בהאנוי"],
	["Hindi", "hi", "नमस्ते, मुझे हनोई में एक अपार्टमेंट चाहिए"],
	["Greek", "el", "Γεια σας, ψάχνω διαμέρισμα στο Ανόι"],
	["Thai", "th", "สวัสดีครับ กำลังหาคอนโดที่ฮานอย"],
])("%s is named from its script", (_, code, text) => {
	expect(identifyLanguage(text)).toBe(code);
});

test("an unsupported language still writes back in English", () => {
	expect(detectLanguage(CLAIRE_FIRST)).toBe("en");
	expect(detectLanguage("Hola")).toBe("en");
});
