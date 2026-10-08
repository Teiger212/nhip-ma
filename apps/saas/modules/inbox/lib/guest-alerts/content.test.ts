import { expect, test } from "vitest";

import { inboxEn as en, inboxVi as vi } from "../test-translate";
import { alertLink, guestAlertContent } from "./content";

/**
 * What an alert says (ADR 0019 "What an alert says", spec #84 "Content"): the guest's name,
 * pipe and language in the operator's language, Vietnamese when they have none set. A guest
 * with no name is "A guest", never their id. No message text. The link carries only the
 * alert's own id, in the office language.
 */
const minji = { guestName: "Minji", pipe: "zalo" as const, guestLanguage: "ko" as const };

test("in English: the guest's name, pipe and language", () => {
	expect(guestAlertContent(minji, en)).toEqual({
		title: "Minji is waiting",
		body: "Zalo · Korean",
	});
});

test("in Vietnamese: the guest's name, pipe and language", () => {
	expect(guestAlertContent(minji, vi)).toEqual({
		title: "Minji đang chờ",
		body: "Zalo · tiếng Hàn",
	});
});

test("a guest with no name is 'A guest' / 'Một khách', never their id", () => {
	const unnamed = { guestName: null, pipe: "whatsapp" as const, guestLanguage: "en" as const };
	expect(guestAlertContent(unnamed, en)).toEqual({
		title: "A guest is waiting",
		body: "WhatsApp · English",
	});
	expect(guestAlertContent(unnamed, vi)).toEqual({
		title: "Một khách đang chờ",
		body: "WhatsApp · tiếng Anh",
	});
});

test("an empty name counts as no name", () => {
	expect(guestAlertContent({ ...minji, guestName: "  " }, en).title).toBe("A guest is waiting");
});

test("before the one-shot has detected the language, the body is the pipe alone", () => {
	expect(guestAlertContent({ ...minji, guestLanguage: null }, en).body).toBe("Zalo");
	expect(guestAlertContent({ ...minji, guestLanguage: null }, vi).body).toBe("Zalo");
});

test("the link opens the Inbox in the office language with the alert's id only", () => {
	expect(alertLink("en", "c0ffee")).toBe("/en/inbox?alert=c0ffee");
	expect(alertLink("vi", "c0ffee")).toBe("/vi/inbox?alert=c0ffee");
});
