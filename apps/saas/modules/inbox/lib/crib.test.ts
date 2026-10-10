import { getMessagesForLocale, type SaasMessages } from "@repo/i18n";
import { expect, test } from "vitest";

import { formatConversationCrib, formatCribNote } from "./crib";
import { emptyQualification } from "./extract";
import { inboxEn as en, inboxVi as vi } from "./test-translate";
import type { GuestLanguage, Qualification } from "./types";

const thao: Qualification = {
	...emptyQualification(),
	rentOrBuy: "rent",
	timeframe: "đầu tháng 9",
	areaOfInterest: "Tây Hồ",
	budgetBand: "30 triệu",
	bedsOrHousehold: "2 bed",
};

test("loaded en and vi saas messages include inbox.crib.note", async () => {
	const enMessages = await getMessagesForLocale<SaasMessages>("en", "saas");
	const viMessages = await getMessagesForLocale<SaasMessages>("vi", "saas");
	expect(enMessages.inbox.crib.note).toMatch(/in \{language\}/);
	expect(viMessages.inbox.crib.note).toMatch(/bằng \{language\}/);
	expect(viMessages.inbox.crib.note).not.toMatch(/Draft|inbound|interviewer|field/i);
	expect(enMessages.inbox.paperworkFlag).toMatch(/Do not invent Vietnamese law/);
	expect(viMessages.inbox.paperworkFlag).toMatch(/Không bịa luật Việt Nam/);
	expect(enMessages.inbox.guestLanguage.vi).toBe("Vietnamese");
	expect(viMessages.inbox.guestLanguage.vi).toBe("tiếng Việt");
	expect(enMessages.inbox.loading).toBe("Loading conversations…");
	expect(viMessages.inbox.loading).toBe("Đang tải cuộc trò chuyện…");
	expect(enMessages.inbox.loadError).toBe("Could not load conversations.");
	expect(viMessages.inbox.loadError).toBe("Không tải được cuộc trò chuyện.");
	expect(enMessages.inbox.retry).toBe("Try again");
	expect(viMessages.inbox.retry).toBe("Thử lại");
	expect(enMessages.inbox.back).toBe("Back");
	expect(viMessages.inbox.back).toBe("Quay lại");
	expect(enMessages.inbox.language).toBe("Language");
	expect(viMessages.inbox.language).toBe("Ngôn ngữ");
	expect(enMessages.inbox.yourTurn).toBe("Your turn");
	expect(viMessages.inbox.yourTurn).toBe("Đến lượt bạn");
	expect(enMessages.inbox.translation).toBe("Translation");
	expect(viMessages.inbox.translation).toBe("Bản dịch");
	expect(enMessages.inbox.quietHint).toMatch(/48 hours/);
	expect(viMessages.inbox.quietHint).toMatch(/48 giờ/);
	expect(enMessages.inbox.forYou).toBe("Operator note");
	expect(viMessages.inbox.forYou).toBe("Ghi chú nội bộ");
	expect(enMessages.app.userMenu.language).toBe("Language");
	expect(viMessages.app.userMenu.language).toBe("Ngôn ngữ");
	expect(enMessages.app.userMenu.accountSettings).toBe("Account settings");
	expect(viMessages.app.userMenu.accountSettings).toBe("Cài đặt tài khoản");
	expect(enMessages.app.userMenu.colorMode).toBe("Color mode");
	expect(viMessages.app.userMenu.colorMode).toBe("Giao diện");
	expect(enMessages.app.userMenu.logout).toBe("Log out");
	expect(viMessages.app.userMenu.logout).toBe("Đăng xuất");
	expect(enMessages.inbox.approveAndSend).toBe("Approve and send");
	expect(viMessages.inbox.approveAndSend).toBe("Duyệt và gửi");
	expect(enMessages.inbox.views.yourTurn).toBe("Your turn");
	expect(viMessages.inbox.views.yourTurn).toBe("Đến lượt bạn");
	expect(enMessages.inbox.views).not.toHaveProperty("needsReply");
	expect(enMessages.inbox.sentTo).toBe("Sent to {name}");
	expect(viMessages.inbox.sentTo).toBe("Đã gửi cho {name}");
	expect(enMessages.inbox).not.toHaveProperty("editReply");
	expect(enMessages.inbox.fields.rentOrBuy).toBe("Rent or buy");
	expect(viMessages.inbox.fields.rentOrBuy).toBe("Thuê hoặc mua");
	expect(enMessages.inbox.intent.rent).toBe("Rent");
	expect(enMessages.inbox.intent.buy).toBe("Buy");
	expect(viMessages.inbox.intent.rent).toBe("thuê");
	expect(viMessages.inbox.intent.buy).toBe("mua");
	expect(enMessages.app.menu.inbox).toBe("Inbox");
	expect(viMessages.app.menu.inbox).toBe("Hộp thư");
	expect(enMessages.app.menu.home).toBe("Home");
	expect(viMessages.app.menu.home).toBe("Trang chủ");
	expect(enMessages.app.menu.paperwork).toBe("Paperwork");
	expect(viMessages.app.menu.paperwork).toBe("Giấy tờ");
	expect(enMessages.app.menu.crm).toBe("CRM");
	expect(viMessages.app.menu.crm).toBe("CRM");
	expect(enMessages.app.menu).not.toHaveProperty("international");
	expect(viMessages.app.menu.accountSettings).toBe("Cài đặt tài khoản");
});

// #248: the note is one line beside "Reply" on how to answer; the guest's facts and the
// paperwork flag are in the guest details beside it, so the note no longer repeats them.
test("English UI note names the reply's language and to ask only what's missing, not the facts", () => {
	const note = formatCribNote({ language: "vi" }, en);
	expect(note).toBe("in Vietnamese · ask only what's missing");
	expect(formatConversationCrib({ oneShot: shotOf(thao, false) }, en)).toBe(note);
	expect(note).not.toMatch(/Tây Hồ|30 triệu|Rent/);
});

test("Vietnamese UI note uses the Vietnamese wording for the same thread", () => {
	const note = formatCribNote({ language: "vi" }, vi);
	expect(note).toBe("bằng tiếng Việt · chỉ hỏi những gì còn thiếu");
	expect(note).not.toMatch(/Draft|inbound|interviewer|field/i);
	expect(note).not.toMatch(/Tây Hồ|30 triệu|thuê/);
});

test("paperwork is left to the details: the note does not repeat the flag, nor invent law", () => {
	const enNote = formatConversationCrib({ oneShot: shotOf(emptyQualification(), true) }, en);
	const viNote = formatConversationCrib({ oneShot: shotOf(emptyQualification(), true) }, vi);
	expect(enNote).toBe("in Japanese · ask only what's missing");
	expect(enNote).not.toMatch(/stored English flag|pink book/);
	expect(viNote).not.toMatch(/sổ hồng/i);
});

test("For you is omitted when there is no one-shot crib", () => {
	expect(formatConversationCrib({ oneShot: null }, en)).toBeNull();
});

test("a one-shot with no facts still gives the note", () => {
	const note = formatConversationCrib({ oneShot: shotOf(emptyQualification(), false, "en") }, en);
	expect(note).toBe("in English · ask only what's missing");
});

function shotOf(
	qualification: Qualification,
	paperwork: boolean,
	language: GuestLanguage = paperwork ? "ja" : "vi",
) {
	return {
		language,
		qualification,
		paperwork: { mentioned: paperwork, flag: paperwork ? "stored English flag" : null },
		draft: { reply: "", answersMessageId: null, source: "template" as const },
	};
}
