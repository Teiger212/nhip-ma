import { expect, test } from "vitest";

import { formatCribNotes } from "./crib";
import { emptyQualification } from "./extract";
import { guestAlertContent } from "./guest-alerts/content";
import { isSupportedLanguage, languageName } from "./language-name";
import { inboxEn as en, inboxVi as vi } from "./test-translate";
import { needsTranslation } from "./translate";
import { GuestLanguage, type Message } from "./types";

// #245, ADR 0021 R4 as amended: an unsupported guest language is named, Nhịp writes back in
// English, and the guest's messages aren't translated. The five read exactly as before.

const supportedName = (t: typeof en) => (language: GuestLanguage) => t(`guestLanguage.${language}`);

test("the five supported languages are GuestLanguage's, no more, no fewer", () => {
	for (const language of GuestLanguage.options) expect(isSupportedLanguage(language)).toBe(true);
	for (const language of ["fr", "es", "zh", "de"])
		expect(isSupportedLanguage(language)).toBe(false);
});

test("an unsupported language is named in the interface language, lowercase in Vietnamese", () => {
	expect(languageName("fr", "en", supportedName(en))).toBe("French");
	expect(languageName("fr", "vi", supportedName(vi))).toBe("tiếng Pháp");
	expect(languageName("zh", "en", supportedName(en))).toBe("Chinese");
});

test("a supported language keeps its own copy", () => {
	expect(languageName("ko", "en", supportedName(en))).toBe("Korean");
	expect(languageName("ko", "vi", supportedName(vi))).toBe("tiếng Hàn");
});

test("the operator note names French and says the reply is in English", () => {
	const shot = { language: "en" as const, guestLanguage: "fr", paperwork: null };
	const qualification = emptyQualification();
	expect(formatCribNotes({ ...shot, qualification }, en, "en")).toMatch(
		/^Guest writes French, not supported: reply is in English\. /,
	);
	expect(formatCribNotes({ ...shot, qualification }, vi, "vi")).toMatch(
		/^Khách viết tiếng Pháp, chưa hỗ trợ: trả lời bằng tiếng Anh\. /,
	);
});

test("the operator note of a supported language reads as before", () => {
	const qualification = emptyQualification();
	expect(
		formatCribNotes({ language: "ko", guestLanguage: "ko", qualification, paperwork: null }, en),
	).toMatch(/^Reply is in Korean\. /);
});

test("an alert names the unsupported language", () => {
	const claire = { guestName: "Claire", pipe: "whatsapp" as const, guestLanguage: "fr" };
	expect(guestAlertContent(claire, en, "en").body).toBe("WhatsApp · French");
	expect(guestAlertContent(claire, vi, "vi").body).toBe("WhatsApp · tiếng Pháp");
});

const guestMessage = (text: string): Message => ({
	id: "m1",
	direction: "in",
	source: "guest",
	text,
	at: new Date(0).toISOString(),
	vendorMessageId: null,
	pipeExternalId: null,
	writtenBy: null,
	translations: {},
});

test("a message on an unsupported guest's thread isn't translated, even a mostly English one", () => {
	const french = guestMessage("Bonjour, je cherche un appartement à Ba Dinh.");
	const mixed = guestMessage(
		"Oui, merci ! Photos please, and is a viewing possible this Saturday?",
	);
	for (const locale of ["en", "vi"] as const) {
		expect(needsTranslation(french, locale, "fr")).toBe(false);
		expect(needsTranslation(mixed, locale, "fr")).toBe(false);
	}
});

test("a supported guest's message is translated as before", () => {
	const korean = guestMessage("안녕하세요, 서호에서 아파트를 찾고 있어요.");
	expect(needsTranslation(korean, "en", "ko")).toBe(true);
	expect(needsTranslation(korean, "vi", "ko")).toBe(true);
	// A thread whose one-shot hasn't run, or ran before #245, reads each message as before.
	expect(needsTranslation(korean, "vi", null)).toBe(true);
	expect(needsTranslation(guestMessage("Hi, is it available?"), "en", "en")).toBe(false);
});
