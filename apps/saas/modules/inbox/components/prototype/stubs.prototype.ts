/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout): stub content for the open-thread layout
 * variants. None of this is real: office-message translations are a hand-written table keyed by
 * the exact text the dev seed holds, guest-detail normalisation is a few regexes and a lookup.
 * The real feature would come from the server (ADR 0007 translations, the one-shot extractor).
 */
import { arrangeExtractRows, type ExtractFieldId } from "../../lib/extract-rows";
import type { Conversation, OperatorLanguage } from "../../lib/types";

type Stub = Partial<Record<OperatorLanguage, string>>;

/** Templates the seed uses for many threads: the area (and rent/buy) is the only variable part. */
const PATTERNS: Array<{ re: RegExp; to: (m: RegExpMatchArray) => Stub }> = [
	{
		re: /^Cảm ơn anh\/chị đã nhắn\. Bên em đã nhận thông tin về thuê tại (.+)\. Đồng nghiệp sẽ trả lời trên đúng chat này ạ\.$/,
		to: (m) => ({
			en: `Thank you for your message. We've received your note about renting in ${m[1]}. A colleague will reply on this same chat.`,
		}),
	},
	{
		re: /^Thanks for writing — we received your note about (renting|buying) in (.+)\. A colleague will reply here on this same chat\.$/,
		to: (m) => ({
			vi: `Cảm ơn anh/chị đã nhắn — bên em đã nhận thông tin về việc ${m[1] === "renting" ? "thuê" : "mua"} tại ${m[2]}. Đồng nghiệp sẽ trả lời ngay trên chat này.`,
		}),
	},
	{
		re: /^Спасибо за сообщение\. Мы получили ваш запрос по (аренде|покупке) в (.+)\. Коллега ответит в этом чате\.$/,
		to: (m) => ({
			en: `Thank you for your message. We've received your request about ${m[1] === "аренде" ? "renting" : "buying"} in ${m[2]}. A colleague will reply in this chat.`,
			vi: `Cảm ơn tin nhắn của anh/chị. Bên em đã nhận yêu cầu ${m[1] === "аренде" ? "thuê" : "mua"} tại ${m[2]}. Đồng nghiệp sẽ trả lời trong chat này.`,
		}),
	},
	{
		re: /^연락 주셔서 감사합니다\. (.+) (임대|매매) 문의 확인했습니다\. 담당자가 이 채팅으로 답변드리겠습니다\.$/,
		to: (m) => ({
			en: `Thank you for getting in touch. We've noted your ${m[2] === "임대" ? "rental" : "purchase"} enquiry for ${m[1]}. Someone from our team will answer in this chat.`,
			vi: `Cảm ơn anh/chị đã liên hệ. Bên em đã ghi nhận yêu cầu ${m[2] === "임대" ? "thuê" : "mua"} tại ${m[1]}. Nhân viên sẽ trả lời trong chat này.`,
		}),
	},
	{
		re: /^ご連絡ありがとうございます。(.+)での(賃貸|購入)のご相談を承りました。担当よりこのチャットでご連絡します。$/,
		to: (m) => ({
			en: `Thank you for contacting us. We've received your ${m[2] === "賃貸" ? "rental" : "purchase"} enquiry for ${m[1]}. Your agent will contact you in this chat.`,
			vi: `Cảm ơn anh/chị đã liên hệ. Bên em đã nhận yêu cầu ${m[2] === "賃貸" ? "thuê" : "mua"} tại ${m[1]}. Nhân viên sẽ liên hệ trong chat này.`,
		}),
	},
	{
		re: /^Thanks for writing to us\. We have your note about renting in (.+), your budget, your timing and your household\.\n\nAuto-reply from Walk Office: a colleague will continue with you right here\.$/,
		to: (m) => ({
			vi: `Cảm ơn anh/chị đã nhắn cho bên em. Bên em đã ghi nhận thông tin về thuê nhà tại ${m[1]}, ngân sách, thời gian và số người ở.\n\nTrả lời tự động từ Walk Office: đồng nghiệp sẽ tiếp tục trao đổi ngay tại đây.`,
		}),
	},
];

/** One-off office texts from the dev seed (sent replies, auto-replies, generic drafts). */
const EXACT: Record<string, Stub> = {
	"Cảm ơn anh/chị đã nhắn. Đồng nghiệp sẽ phản hồi trên đúng chat này sớm ạ.": {
		en: "Thank you for your message. A colleague will reply on this same chat shortly.",
	},
	"Thanks for your message. A colleague will get back to you here shortly.": {
		vi: "Cảm ơn anh/chị đã nhắn. Đồng nghiệp sẽ sớm trả lời tại đây.",
	},
	"메시지 감사합니다. 담당자가 이 채팅으로 곧 답변드리겠습니다.": {
		en: "Thank you for your message. Someone from our team will answer in this chat soon.",
		vi: "Cảm ơn tin nhắn của anh/chị. Nhân viên sẽ sớm trả lời trong chat này.",
	},
	"ご連絡ありがとうございます。担当よりこのチャットで折り返しご連絡いたします。": {
		en: "Thank you for contacting us. Your agent will get back to you in this chat.",
		vi: "Cảm ơn anh/chị đã liên hệ. Nhân viên sẽ phản hồi trong chat này.",
	},
	"연락 주셔서 감사합니다. Tây Hồ 임대, 예산, 거주 인원 관련 내용을 확인했습니다. 언제쯤 입주를 원하시나요?\n\nWalk Office 자동 응답: 담당자가 이 채팅에서 이어서 도와드리겠습니다.":
		{
			en: "Thank you for getting in touch. We've noted your rental in Tây Hồ, your budget and your household. When would you like to move in?\n\nAuto-reply from Walk Office: a colleague will continue with you in this chat.",
			vi: "Cảm ơn anh/chị đã liên hệ. Bên em đã ghi nhận nhu cầu thuê ở Tây Hồ, ngân sách và số người ở. Anh/chị muốn dọn vào khi nào?\n\nTrả lời tự động từ Walk Office: đồng nghiệp sẽ tiếp tục hỗ trợ trong chat này.",
		},
	"연락 주셔서 감사합니다. Long Biên 임대, 예산, 입주 시기, 거주 인원 관련 내용을 확인했습니다.\n\nWalk Office 자동 응답: 담당자가 이 채팅에서 이어서 도와드리겠습니다.":
		{
			en: "Thank you for getting in touch. We've noted your rental in Long Biên, your budget, move-in timing and household.\n\nAuto-reply from Walk Office: a colleague will continue with you in this chat.",
		},
	"ご連絡ありがとうございます。Cầu Giấyでの賃貸のご希望、ご予算、ご入居時期、ご入居人数について承りました。\n\nWalk Officeからの自動返信：担当者がこのチャットで引き続きご対応いたします。":
		{
			en: "Thank you for contacting us. We've noted your wish to rent in Cầu Giấy, your budget, move-in timing and household.\n\nAuto-reply from Walk Office: your agent will continue with you in this chat.",
		},
	"Cảm ơn anh/chị đã nhắn cho bên em. Bên em đã ghi nhận thông tin của anh/chị về thuê nhà tại Tây Hồ, ngân sách và số người ở. Anh/chị dự định dọn vào khi nào ạ?\n\nTrả lời tự động từ Walk Office: một đồng nghiệp sẽ tiếp tục trao đổi với anh/chị ngay tại đây.":
		{
			en: "Thank you for writing to us. We've noted your details about renting in Tây Hồ, your budget and household size. When do you plan to move in?\n\nAuto-reply from Walk Office: a colleague will continue with you right here.",
		},
	"Cảm ơn anh/chị đã nhắn cho bên em. Bên em đã ghi nhận thông tin của anh/chị về thuê nhà tại Ciputra, ngân sách, thời gian dọn vào và số người ở.\n\nTrả lời tự động từ Walk Office: một đồng nghiệp sẽ tiếp tục trao đổi với anh/chị ngay tại đây.":
		{
			en: "Thank you for writing to us. We've noted your details about renting in Ciputra, your budget, move-in timing and household size.\n\nAuto-reply from Walk Office: a colleague will continue with you right here.",
		},
	"Cảm ơn anh/chị đã nhắn cho bên em. Bên em đã ghi nhận thông tin của anh/chị về mua nhà tại Vinhomes và số người ở. Ngân sách của anh/chị khoảng bao nhiêu ạ? Anh/chị dự định dọn vào khi nào ạ?\n\nTrả lời tự động từ Walk Office: một đồng nghiệp sẽ tiếp tục trao đổi với anh/chị ngay tại đây.":
		{
			en: "Thank you for writing to us. We've noted your details about buying in Vinhomes and your household size. Roughly what is your budget? When do you plan to move in?\n\nAuto-reply from Walk Office: a colleague will continue with you right here.",
		},
	"こんにちは！Ba Dinhに$1100の1 bedroomがございます。明日ご内見いただけます。": {
		en: "Hello! We have a 1-bedroom in Ba Dinh at $1,100. You can view it tomorrow.",
	},
	"Chào em Thu, chị gửi em danh sách 6 căn 1 phòng ngủ ở Cầu Giấy trong hôm nay nhé.": {
		en: "Hi Thu, I'll send you the list of six 1-bedroom flats in Cầu Giấy today.",
	},
	"はじめまして！Tay Hoに2 bedroomが3件ございます。来週火曜日はいかがでしょうか。": {
		en: "Nice to meet you! We have three 2-bedrooms in Tay Ho. How about next Tuesday?",
	},
	"承知しました。火曜日の午後2時にお待ちしております。": {
		en: "Understood. We'll see you on Tuesday at 2 pm.",
	},
	"Chào anh Hải, bên em có một căn 2 phòng ngủ ở Đống Đa giá 19 triệu, hợp để làm việc tại nhà. Anh xem ảnh nhé?":
		{
			en: "Hi Hải, we have a 2-bedroom in Đống Đa at 19 million, good for working from home. Shall I send photos?",
		},
	"Здравствуйте, Елена! В Times City есть квартира с 2 спальнями за $1300. Могу показать в субботу.":
		{
			en: "Hello, Elena! There's a 2-bedroom flat in Times City for $1,300. I can show it on Saturday.",
		},
	"こんにちは！Ciputraに$2400前後の3 bedroomが2件ございます。今週ご内見はいかがでしょうか。": {
		en: "Hello! We have two 3-bedrooms in Ciputra at around $2,400. Would a viewing this week suit you?",
	},
	"안녕하세요! Times City 근처에 $900 안팎의 1 bedroom이 두 곳 있습니다. 이번 주에 보러 오시겠어요?":
		{
			en: "Hello! There are two 1-bedrooms near Times City at around $900. Would you like to see them this week?",
			vi: "Xin chào! Gần Times City có hai căn 1 phòng ngủ khoảng 900 USD. Anh/chị muốn xem trong tuần này không?",
		},
	"Здравствуйте, Михаил! В Hai Ba Trung есть две квартиры с 1 спальней до $1000 в месяц. Когда вам удобно посмотреть?":
		{
			en: "Hello, Mikhail! In Hai Ba Trung there are two 1-bedroom flats up to $1,000 a month. When would suit you for a viewing?",
			vi: "Chào anh Mikhail! Ở Hai Bà Trưng có hai căn 1 phòng ngủ dưới 1000 USD/tháng. Khi nào anh tiện đi xem?",
		},
	"Добрый вечер, Николай! Сегодня пришлю подборку квартир с 3 спальнями в Landmark.": {
		en: "Good evening, Nikolai! I'll send a selection of 3-bedroom flats in Landmark today.",
	},
	"Chào chị Linh, bên em có ba căn 2 phòng ngủ ở Long Biên quanh 3 tỷ. Chị muốn xem căn nào trước ạ?":
		{
			en: "Hi Linh, we have three 2-bedrooms in Long Biên at around 3 billion. Which would you like to see first?",
		},
	"Dạ được ạ, em hẹn chị sáng thứ Bảy lúc 9 giờ nhé.": {
		en: "Of course. I'll book you in for Saturday at 9 am.",
	},
	"Chào anh Khánh, cảm ơn anh đã quay lại! Bên em có một studio ở Ba Đình giá 9,5 triệu, anh xem ảnh nhé?":
		{
			en: "Hi Khánh, thanks for coming back! We have a studio in Ba Đình at 9.5 million. Shall I send photos?",
		},
	"Chào anh Tuấn, bên em có hai căn 2 phòng ngủ ở Cầu Giấy trong tầm 18 triệu. Anh muốn xem vào ngày nào ạ?":
		{
			en: "Hi Tuấn, we have two 2-bedrooms in Cầu Giấy at around 18 million. Which day would you like to view?",
		},
	"Chào em Vy, chị có hai studio ở Hai Bà Trưng giá 8,5 và 9 triệu. Em muốn xem căn nào?": {
		en: "Hi Vy, I have two studios in Hai Bà Trưng at 8.5 and 9 million. Which would you like to see?",
	},
	"Được em, chị hẹn em 3 giờ chiều mai nhé.": { en: "Sure, see you at 3 pm tomorrow." },
	"Bonjour Claire! We have a 3-bedroom in Ba Dinh at $2900/month, newly renovated. Would you like photos first?":
		{
			vi: "Chào Claire! Bên em có căn 3 phòng ngủ ở Ba Đình giá 2900 USD/tháng, mới sửa. Chị muốn xem ảnh trước không?",
		},
};

export type StubTranslation = { text: string; stub: boolean } | null;

/** Rough script sniffing, good enough for the seed: Cyrillic, CJK, Hangul. */
const NON_LATIN = /[Ѐ-ӿ぀-ヿ一-鿿가-힯]/;
/** Vietnamese-only letters (đ, ơ, ư and the stacked tone marks). */
const VIETNAMESE = /[đĐơƠưƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/;

/**
 * An office message (or the reply being drafted) in the operator's language. `null` when it is
 * already in that language; a visibly marked placeholder when the table doesn't know the text
 * (the operator edited the draft, or a thread the seed doesn't have).
 */
export function stubTranslate(
	text: string,
	operator: OperatorLanguage,
	guestLanguage: string | null | undefined,
): StubTranslation {
	const key = text.trim();
	if (!key) return null;
	const exact = EXACT[key];
	if (exact?.[operator]) return { text: exact[operator], stub: false };
	for (const { re, to } of PATTERNS) {
		const m = key.match(re);
		if (!m) continue;
		const hit = to(m)[operator];
		if (hit) return { text: hit, stub: false };
		break;
	}
	// Already in the operator's language: nothing to translate.
	if (operator === "vi" && VIETNAMESE.test(key)) return null;
	if (operator === "en" && !NON_LATIN.test(key) && !VIETNAMESE.test(key)) return null;
	if (guestLanguage === operator) return null;
	return {
		text:
			operator === "vi"
				? "(stub) Không có trong bảng dịch của bản thử; bản dịch thật sẽ hiện ở đây."
				: "(stub) Not in the prototype's translation table; the real translation shows here.",
		stub: true,
	};
}

const TIMEFRAMES: Record<string, Stub> = {
	"на этой неделе": { en: "this week", vi: "tuần này" },
	"в следующем месяце": { en: "next month", vi: "tháng sau" },
	"tuần sau": { en: "next week" },
	"tháng sau": { en: "next month" },
	"cuối tháng": { en: "end of this month" },
	"đầu tháng": { en: "start of next month" },
	"đầu tháng 11": { en: "early November" },
	"đầu tháng 9": { en: "early September" },
	今月: { en: "this month", vi: "tháng này" },
	来月: { en: "next month", vi: "tháng sau" },
	来週: { en: "next week", vi: "tuần sau" },
	"다음 주": { en: "next week", vi: "tuần sau" },
	"next week": { vi: "tuần sau" },
	"next month": { vi: "tháng sau" },
	"this Saturday": { vi: "thứ Bảy này" },
	"this Friday": { vi: "thứ Sáu này" },
	"in 3 weeks": { vi: "3 tuần nữa" },
	"early January": { vi: "đầu tháng 1" },
	"mid November": { vi: "giữa tháng 11" },
	"1 Dec": { en: "1 December", vi: "1 tháng 12" },
};

function money(n: number, operator: OperatorLanguage): string {
	return new Intl.NumberFormat(operator === "vi" ? "vi-VN" : "en-US").format(n);
}

function normaliseBudget(raw: string, operator: OperatorLanguage): string | null {
	const perMonthVi = /\/\s*tháng/.test(raw);
	const perMonthEn = /\/\s*month/i.test(raw);
	const month = perMonthVi || perMonthEn ? (operator === "vi" ? " / tháng" : " / month") : "";
	const vnd = raw.match(/^(\d+(?:[.,]\d+)?)\s*(triệu|tỷ)/i);
	if (vnd) {
		const n = Number(vnd[1].replace(",", "."));
		const scale = vnd[2].toLowerCase() === "tỷ" ? 1_000_000_000 : 1_000_000;
		return `${money(Math.round(n * scale), operator)} VND${month}`;
	}
	const usd = raw.match(/^\$\s*([\d,]+)/);
	if (usd) return `$${money(Number(usd[1].replace(/,/g, "")), operator)}${month}`;
	return null;
}

function normaliseBeds(raw: string, operator: OperatorLanguage): string | null {
	if (operator === "vi") {
		return raw
			.replace(/(\d+) bed/, "$1 phòng ngủ")
			.replace(/family of (\d+)/, "gia đình $1 người")
			.replace(/(\d+) kids/, "$1 con")
			.replace(/(\d+) people/, "$1 người")
			.replace("couple", "cặp đôi");
	}
	return raw.replace(/(\d+) bed\b/, (_, n) => `${n} bedroom${n === "1" ? "" : "s"}`).replace(", ", " · ");
}

export type ProtoFact = {
	id: ExtractFieldId;
	/** What the guest wrote, when it differs from `value`. */
	raw: string | null;
	value: string;
};

/**
 * A guest-detail value in the operator's language: Move-in "на этой неделе" → "this week",
 * Budget "15 triệu" → "15,000,000 VND". Returns the raw span too when it changed.
 */
export function normaliseFact(
	id: ExtractFieldId,
	raw: string,
	operator: OperatorLanguage,
): { value: string; raw: string | null } {
	let value: string | null = null;
	if (id === "moveIn") value = TIMEFRAMES[raw.trim()]?.[operator] ?? TIMEFRAMES[raw.trim().toLowerCase()]?.[operator] ?? null;
	if (id === "budget") value = normaliseBudget(raw, operator);
	if (id === "beds") value = normaliseBeds(raw, operator);
	if (!value || value === raw) return { value: raw, raw: null };
	return { value, raw };
}

/** The details the guest hasn't given yet, named. Paperwork "none mentioned" is not missing data. */
export function missingFieldIds(conversation: Conversation): ExtractFieldId[] {
	return arrangeExtractRows(conversation.oneShot)
		.collapsed.filter((row) => row.id !== "paperwork")
		.map((row) => row.id);
}
