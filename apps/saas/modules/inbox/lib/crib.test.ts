import { getMessagesForLocale, type SaasMessages } from "@repo/i18n";
import { expect, test } from "vitest";

import enSaas from "../../../../../packages/i18n/translations/en/saas.json";
import viSaas from "../../../../../packages/i18n/translations/vi/saas.json";
import { formatConversationCrib, formatCribNotes } from "./crib";
import { emptyQualification } from "./extract";
import type { GuestLanguage, Qualification } from "./types";

function translate(messages: Record<string, unknown>) {
	return (key: string, values: Record<string, string> = {}) => {
		const raw = key.split(".").reduce<unknown>((acc, part) => {
			if (!acc || typeof acc !== "object") {
				return undefined;
			}
			return (acc as Record<string, unknown>)[part];
		}, messages);
		if (typeof raw !== "string") {
			throw new Error(`Missing inbox key ${key}`);
		}
		return raw.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
	};
}

const en = translate(enSaas.inbox);
const vi = translate(viSaas.inbox);

const thao: Qualification = {
	...emptyQualification(),
	rentOrBuy: "rent",
	timeframe: "đầu tháng 9",
	areaOfInterest: "Tây Hồ",
	budgetBand: "30 triệu",
	bedsOrHousehold: "2 bed",
};

test("loaded en and vi saas messages include inbox.crib.body", async () => {
	const enMessages = await getMessagesForLocale<SaasMessages>("en", "saas");
	const viMessages = await getMessagesForLocale<SaasMessages>("vi", "saas");
	expect(enMessages.inbox.crib.body).toMatch(/Reply is in \{language\}/);
	expect(viMessages.inbox.crib.body).toMatch(/Bản trả lời bằng \{language\}/);
	expect(viMessages.inbox.crib.body).not.toMatch(/Draft|inbound|interviewer|field/i);
	expect(enMessages.inbox.guestLanguage.vi).toBe("Vietnamese");
	expect(viMessages.inbox.guestLanguage.vi).toBe("tiếng Việt");
	expect(enMessages.inbox.loading).toBe("Loading conversations…");
	expect(viMessages.inbox.loading).toBe("Đang tải cuộc hội thoại…");
	expect(enMessages.inbox.loadError).toBe("Could not load conversations.");
	expect(viMessages.inbox.loadError).toBe("Không tải được cuộc hội thoại.");
	expect(enMessages.inbox.retry).toBe("Try again");
	expect(viMessages.inbox.retry).toBe("Thử lại");
	expect(enMessages.inbox.back).toBe("Back");
	expect(viMessages.inbox.back).toBe("Quay lại");
	expect(enMessages.inbox.language).toBe("Language");
	expect(viMessages.inbox.language).toBe("Ngôn ngữ");
	expect(enMessages.inbox.needsApprove).toBe("Needs approval");
	expect(viMessages.inbox.needsApprove).toBe("Cần duyệt");
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
	expect(enMessages.app.menu.inbox).toBe("Inbox");
	expect(viMessages.app.menu.inbox).toBe("Hộp thư");
	expect(enMessages.app.menu.home).toBe("Home");
	expect(viMessages.app.menu.home).toBe("Trang chủ");
	expect(enMessages.app.menu.international).toBe("International");
	expect(viMessages.app.menu.international).toBe("Quốc tế");
	expect(viMessages.app.menu.accountSettings).toBe("Cài đặt tài khoản");
});

test("English UI crib uses the English template and extracted facts", () => {
	const crib = formatCribNotes(
		{ language: "vi", qualification: thao, paperwork: { mentioned: false, flag: null } },
		en,
	);
	expect(crib).toBe(
		"Reply is in Vietnamese. From the guest: rent, đầu tháng 9, Tây Hồ, 30 triệu, 2 bed. Do not interview.",
	);
});

test("Vietnamese UI crib uses the Vietnamese template for the same extract", () => {
	const crib = formatCribNotes(
		{ language: "vi", qualification: thao, paperwork: { mentioned: false, flag: null } },
		vi,
	);
	expect(crib).toBe(
		"Bản trả lời bằng tiếng Việt. Lấy từ tin khách: thuê, đầu tháng 9, Tây Hồ, 30 triệu, 2 bed. Đừng hỏi thêm kiểu phỏng vấn.",
	);
	expect(crib).not.toMatch(/Draft|inbound|interviewer|field/i);
	expect(crib).not.toMatch(/Draft is in/);
	expect(crib).not.toMatch(/Not an interviewer/);
});

test("paperwork flag is localized and does not invent law", () => {
	const paperwork = {
		mentioned: true,
		flag: "stored English flag",
	};
	const enCrib = formatCribNotes(
		{ language: "ja" as GuestLanguage, qualification: emptyQualification(), paperwork },
		en,
	);
	const viCrib = formatCribNotes(
		{ language: "ja" as GuestLanguage, qualification: emptyQualification(), paperwork },
		vi,
	);
	expect(enCrib).toMatch(/Do not invent Vietnamese law/);
	expect(enCrib).not.toMatch(/stored English flag/);
	expect(viCrib).toMatch(/Không bịa luật Việt Nam/);
	expect(viCrib).not.toMatch(/sổ hồng ngày mai/i);
});

test("For you is omitted when there is no one-shot crib", () => {
	expect(formatConversationCrib({ oneShot: null }, en)).toBeNull();
});

test("empty one-shot facts use the empty-facts crib string", () => {
	const crib = formatConversationCrib(
		{
			oneShot: {
				language: "en",
				qualification: emptyQualification(),
				paperwork: { mentioned: false, flag: null },
				draft: { reply: "", crib: "", cribLanguage: "vi" },
			},
		},
		en,
	);
	expect(crib).toMatch(/nothing from the guest yet/);
	expect(crib).not.toBe("");
});
