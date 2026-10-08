import type { GuestLanguage, Qualification } from "./types";

/**
 * The auto-reply's fixed template (ADR 0021, R9): what goes out when no model writes the
 * greeting. Built from the local extraction only, so it needs no model. It thanks the guest,
 * acknowledges what they gave, asks for at most two missing details (R3), and ends with the
 * label (R7). Its own text has no figure (G2): a budget, a timeframe or a household is
 * acknowledged by kind, never by value.
 *
 * EN is the reference text. VI, JA, KO and RU wait on Eyal's review and a native read (#78).
 */

/** The details the auto-reply may ask for, in R3's order. */
export type Qualifier = "rentOrBuy" | "area" | "budget" | "timeframe" | "household";

/** At most this many questions in an auto-reply (G2). */
export const MAX_GREETING_QUESTIONS = 2;

/**
 * Every detail the guest hasn't given that the auto-reply would ask for, in R3's order: rent or
 * buy, area, budget, timeframe, household. The guest details' missing line names this same list
 * (#244), so the card and the auto-reply never disagree.
 */
export function missingQualifiers(qualification: Partial<Qualification>): Qualifier[] {
	const missing: Record<Qualifier, boolean> = {
		rentOrBuy: !qualification.rentOrBuy,
		area: !qualification.areaOfInterest,
		budget: !qualification.budgetBand,
		timeframe: !qualification.timeframe,
		household: !qualification.bedsOrHousehold,
	};
	const order: Qualifier[] = ["rentOrBuy", "area", "budget", "timeframe", "household"];
	return order.filter((qualifier) => missing[qualifier]);
}

/** R3's first missing details, at most two (G2). */
export function greetingAsks(qualification: Qualification): Qualifier[] {
	return missingQualifiers(qualification).slice(0, MAX_GREETING_QUESTIONS);
}

type Copy = {
	thanks: string;
	/** What the guest asked for: rent or buy, with the area when there is one. */
	intent: (rentOrBuy: "rent" | "buy", area: string | null) => string;
	/** An area without rent or buy. */
	areaOnly: (area: string) => string;
	/** The details acknowledged by kind only. */
	kinds: { budget: string; timeframe: string; household: string };
	/** Joins the acknowledged parts as the language lists them. */
	list: (parts: string[]) => string;
	acknowledge: (list: string) => string;
	questions: Record<Qualifier, string>;
	label: (office: string) => string;
};

/** "a", "a and b", "a, b and c". */
function listWith(and: string): (parts: string[]) => string {
	return (parts) =>
		parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")}${and}${parts.at(-1)}`;
}

const COPY: Record<GuestLanguage, Copy> = {
	en: {
		thanks: "Thanks for writing to us.",
		intent: (rentOrBuy, area) =>
			`${rentOrBuy === "rent" ? "renting" : "buying"}${area ? ` in ${area}` : ""}`,
		areaOnly: (area) => area,
		kinds: { budget: "your budget", timeframe: "your timing", household: "your household" },
		list: listWith(" and "),
		acknowledge: (list) => `We have your note about ${list}.`,
		questions: {
			rentOrBuy: "Are you looking to rent or to buy?",
			area: "Which area or building do you have in mind?",
			budget: "What budget do you have in mind?",
			timeframe: "When would you like to move in?",
			household: "Who will be living there, and how many bedrooms do you need?",
		},
		label: (office) => `Auto-reply from ${office}: a colleague will continue with you right here.`,
	},
	vi: {
		thanks: "Cảm ơn anh/chị đã nhắn cho bên em.",
		intent: (rentOrBuy, area) =>
			`${rentOrBuy === "rent" ? "thuê nhà" : "mua nhà"}${area ? ` tại ${area}` : ""}`,
		areaOnly: (area) => `khu vực ${area}`,
		kinds: { budget: "ngân sách", timeframe: "thời gian dọn vào", household: "số người ở" },
		list: listWith(" và "),
		acknowledge: (list) => `Bên em đã ghi nhận thông tin của anh/chị về ${list}.`,
		questions: {
			rentOrBuy: "Anh/chị muốn thuê hay mua ạ?",
			area: "Anh/chị quan tâm khu vực hoặc tòa nhà nào ạ?",
			budget: "Ngân sách của anh/chị khoảng bao nhiêu ạ?",
			timeframe: "Anh/chị dự định dọn vào khi nào ạ?",
			household: "Những ai sẽ ở cùng, và anh/chị cần mấy phòng ngủ ạ?",
		},
		label: (office) =>
			`Trả lời tự động từ ${office}: một đồng nghiệp sẽ tiếp tục trao đổi với anh/chị ngay tại đây.`,
	},
	ja: {
		thanks: "ご連絡ありがとうございます。",
		intent: (rentOrBuy, area) =>
			`${area ? `${area}での` : ""}${rentOrBuy === "rent" ? "賃貸" : "ご購入"}のご希望`,
		areaOnly: (area) => `${area}のご希望`,
		kinds: { budget: "ご予算", timeframe: "ご入居時期", household: "ご入居人数" },
		list: (parts) => parts.join("、"),
		acknowledge: (list) => `${list}について承りました。`,
		questions: {
			rentOrBuy: "賃貸とご購入のどちらをお考えですか？",
			area: "ご希望のエリアや建物はございますか？",
			budget: "ご予算はどのくらいをお考えですか？",
			timeframe: "いつ頃のご入居をご希望ですか？",
			household: "どなたがお住まいになり、寝室はいくつ必要ですか？",
		},
		label: (office) => `${office}からの自動返信：担当者がこのチャットで引き続きご対応いたします。`,
	},
	ko: {
		thanks: "연락 주셔서 감사합니다.",
		intent: (rentOrBuy, area) =>
			`${area ? `${area} ` : ""}${rentOrBuy === "rent" ? "임대" : "매매"}`,
		areaOnly: (area) => area,
		kinds: { budget: "예산", timeframe: "입주 시기", household: "거주 인원" },
		list: (parts) => parts.join(", "),
		acknowledge: (list) => `${list} 관련 내용을 확인했습니다.`,
		questions: {
			rentOrBuy: "임대와 매매 중 어느 쪽을 찾고 계신가요?",
			area: "생각하고 계신 지역이나 건물이 있으신가요?",
			budget: "예산은 어느 정도로 생각하고 계신가요?",
			timeframe: "언제쯤 입주를 원하시나요?",
			household: "어떤 분들이 거주하시고, 침실은 몇 개가 필요하신가요?",
		},
		label: (office) => `${office} 자동 응답: 담당자가 이 채팅에서 이어서 도와드리겠습니다.`,
	},
	ru: {
		thanks: "Спасибо, что написали нам.",
		intent: (rentOrBuy, area) =>
			`${rentOrBuy === "rent" ? "аренда" : "покупка"}${area ? ` в районе ${area}` : ""}`,
		areaOnly: (area) => `район ${area}`,
		kinds: { budget: "бюджет", timeframe: "сроки", household: "состав семьи" },
		list: listWith(" и "),
		acknowledge: (list) => `Мы получили ваш запрос: ${list}.`,
		questions: {
			rentOrBuy: "Вы хотите снять жильё или купить?",
			area: "Какой район или дом вы рассматриваете?",
			budget: "На какой бюджет вы рассчитываете?",
			timeframe: "Когда вы хотели бы заехать?",
			household: "Кто будет жить в квартире и сколько спален вам нужно?",
		},
		label: (office) => `Автоответ от ${office}: коллега продолжит общение с вами прямо здесь.`,
	},
};

/**
 * The auto-reply's question for `qualifier`, in `language`. The template suggested reply asks in
 * the same words (ADR 0024), so a question either one sent is recognised by `askedIn`.
 */
export function greetingQuestion(language: GuestLanguage, qualifier: Qualifier): string {
	return COPY[language].questions[qualifier];
}

/**
 * The details an office message asks for, by these questions in any language: what the
 * auto-reply asked as it was sent, not as today's details would ask it. A question the agent
 * reworded before sending is not recognised.
 */
export function askedIn(text: string): Qualifier[] {
	const normalized = text.normalize("NFC");
	const asked = new Set<Qualifier>();
	for (const copy of Object.values(COPY)) {
		for (const [qualifier, question] of Object.entries(copy.questions) as [Qualifier, string][]) {
			if (normalized.includes(question.normalize("NFC"))) asked.add(qualifier);
		}
	}
	return [...asked];
}

/**
 * The always-on disclosure (R7), in the guest's language. It names the office, so it is also
 * the signature (G2). Code adds it to every auto-reply, never the model, and it is never
 * shortened. Its proposed place is the last line, pending the lawyer.
 */
export function greetingLabel(language: GuestLanguage, officeName: string): string {
	return COPY[language].label(officeName);
}

/** An auto-reply's text with the label as its last line. */
export function withGreetingLabel(body: string, language: GuestLanguage, officeName: string) {
	return `${body}\n\n${greetingLabel(language, officeName)}`;
}

/** The fixed template (R9) in the guest's language, label included. */
export function greetingTemplate(
	language: GuestLanguage,
	qualification: Qualification,
	officeName: string,
): string {
	const copy = COPY[language];
	const area = qualification.areaOfInterest;
	const parts: string[] = [];
	if (qualification.rentOrBuy) parts.push(copy.intent(qualification.rentOrBuy, area));
	else if (area) parts.push(copy.areaOnly(area));
	if (qualification.budgetBand) parts.push(copy.kinds.budget);
	if (qualification.timeframe) parts.push(copy.kinds.timeframe);
	if (qualification.bedsOrHousehold) parts.push(copy.kinds.household);

	const sentences = [copy.thanks];
	if (parts.length > 0) sentences.push(copy.acknowledge(copy.list(parts)));
	for (const qualifier of greetingAsks(qualification)) sentences.push(copy.questions[qualifier]);
	// Japanese runs its sentences together; the others leave a space.
	const body = sentences.join(language === "ja" ? "" : " ");
	return withGreetingLabel(body, language, officeName);
}
