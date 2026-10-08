import { askedIn, greetingQuestion, type Qualifier } from "./greeting";
import type { Conversation, GuestLanguage, Qualification, RentOrBuy } from "./types";

/**
 * The template suggested reply (ADR 0024, CONTEXT.md "Suggested reply"): the reply with no
 * model, in the agent's own voice. It is the first reply, and the fallback for every later one.
 *
 * - While the office has no human reply yet, it introduces the agent: the thread owner's first
 *   name and the office, or the office alone while the thread is Unassigned. Only the template
 *   names anyone; the model's draft never does.
 * - It thanks the guest only when the office has sent nothing at all: after the auto-reply that
 *   would be the second thanks.
 * - It promises an action and never claims stock, and it states no figure.
 * - It asks at most one question, before the office's first human reply only: the first missing
 *   detail that changes what the agent would send, never one the office already asked (ADR
 *   0024's no-repeat rule). A later turn asks nothing: a template can't read what a human reply
 *   asked.
 *
 * EN is the reference. The VI copy is pending a native read (#78); JA, KO and RU have no native
 * read planned yet.
 */

/** What the template reads of a thread. */
export type TemplateThread = Pick<Conversation, "guestName" | "sentAt"> & {
	/** The thread owner's account name; null while the thread is Unassigned. */
	ownerName: string | null;
	/** The office's name (`organization.name`); null when it can't be read, and then no intro. */
	officeName: string | null;
	messages: Pick<Conversation["messages"][number], "direction" | "source" | "text">[];
};

/** A thread with nothing on it yet: no owner, no office name, no office message. */
export const NEW_THREAD: TemplateThread = {
	guestName: null,
	sentAt: null,
	ownerName: null,
	officeName: null,
	messages: [],
};

/** The details whose answer changes which places the agent sends; move-in doesn't, yet. */
const CHANGES_THE_SEND: Qualifier[] = ["rentOrBuy", "area", "budget", "household"];

type Copy = {
	/** The intro of an assigned thread: the guest (when named), the agent and the office. */
	introAgent: (guest: string | null, agent: string, office: string) => string;
	/** The intro of an Unassigned thread: the office only. */
	introOffice: (guest: string | null, office: string) => string;
	thanks: string;
	/** What the guest is after, to say what the agent will send; null when it isn't known. */
	about: (rentOrBuy: RentOrBuy | null, area: string | null) => string | null;
	/** What the agent will do next. */
	plan: (about: string | null) => string;
	/** A later turn, once the office has replied: acknowledge and promise to come back. */
	later: string;
};

/** Joins `rentOrBuy` and `area` the language's way; null when neither is known. */
function aboutWith(
	rent: string,
	buy: string,
	both: (intent: string, area: string) => string,
	areaOnly: (area: string) => string,
) {
	return (rentOrBuy: RentOrBuy | null, area: string | null): string | null => {
		const intent = rentOrBuy === "rent" ? rent : rentOrBuy === "buy" ? buy : null;
		if (intent && area) return both(intent, area);
		if (area) return areaOnly(area);
		return intent;
	};
}

const COPY: Record<GuestLanguage, Copy> = {
	en: {
		introAgent: (guest, agent, office) =>
			`Hi${guest ? ` ${guest}` : ""}, I'm ${agent} from ${office}.`,
		introOffice: (guest, office) => `Hi${guest ? ` ${guest}` : ""}, this is ${office}.`,
		thanks: "Thanks for getting in touch.",
		about: aboutWith(
			"to rent",
			"to buy",
			(intent, area) => `${intent} in ${area}`,
			(area) => `in ${area}`,
		),
		plan: (about) =>
			about
				? `I'll pull together a few options ${about} and send them here shortly.`
				: "I'll help you find the right place.",
		later: "Noted. I'll look into this and get back to you here shortly.",
	},
	vi: {
		introAgent: (guest, agent, office) =>
			`Chào anh/chị${guest ? ` ${guest}` : ""}, em là ${agent} bên ${office} ạ.`,
		introOffice: (guest, office) => `Chào anh/chị${guest ? ` ${guest}` : ""}, em bên ${office} ạ.`,
		thanks: "Cảm ơn anh/chị đã liên hệ.",
		about: aboutWith(
			"cho thuê",
			"đang bán",
			(intent, area) => `${intent} ở ${area}`,
			(area) => `ở ${area}`,
		),
		plan: (about) =>
			about
				? `Em sẽ chọn vài căn ${about} phù hợp và gửi anh/chị ngay trên chat này ạ.`
				: "Em sẽ hỗ trợ anh/chị tìm căn phù hợp ạ.",
		later: "Em đã nhận được tin nhắn. Em sẽ kiểm tra và phản hồi anh/chị ngay trên chat này ạ.",
	},
	ja: {
		introAgent: (guest, agent, office) => `${guest ? `${guest}様、` : ""}${office}の${agent}です。`,
		introOffice: (guest, office) => `${guest ? `${guest}様、` : ""}${office}です。`,
		thanks: "ご連絡ありがとうございます。",
		about: aboutWith(
			"賃貸物件",
			"売買物件",
			(intent, area) => `${area}の${intent}`,
			(area) => `${area}の物件`,
		),
		plan: (about) =>
			about
				? `${about}をいくつかお探しして、追ってこのチャットでお送りします。`
				: "お部屋探しをお手伝いいたします。",
		later: "承知しました。確認のうえ、このチャットで改めてご連絡いたします。",
	},
	ko: {
		introAgent: (guest, agent, office) =>
			`안녕하세요${guest ? ` ${guest}님` : ""}, ${office}의 ${agent}입니다.`,
		introOffice: (guest, office) => `안녕하세요${guest ? ` ${guest}님` : ""}, ${office}입니다.`,
		thanks: "연락 주셔서 감사합니다.",
		about: aboutWith(
			"임대",
			"매매",
			(intent, area) => `${area} ${intent}`,
			(area) => area,
		),
		plan: (about) =>
			about
				? `${about} 매물을 몇 곳 추려서 이 채팅으로 곧 보내드리겠습니다.`
				: "집 찾기를 도와드리겠습니다.",
		later: "확인했습니다. 알아보고 이 채팅으로 곧 다시 연락드리겠습니다.",
	},
	ru: {
		introAgent: (guest, agent, office) =>
			`Здравствуйте${guest ? `, ${guest}` : ""}! Меня зовут ${agent}, я из ${office}.`,
		introOffice: (guest, office) =>
			`Здравствуйте${guest ? `, ${guest}` : ""}! Вам пишет ${office}.`,
		thanks: "Спасибо, что написали.",
		about: aboutWith(
			"для аренды",
			"для покупки",
			(intent, area) => `${intent} в районе ${area}`,
			(area) => `в районе ${area}`,
		),
		plan: (about) =>
			about
				? `Я подберу несколько вариантов ${about} и пришлю их сюда в ближайшее время.`
				: "Я помогу вам подобрать подходящий вариант.",
		later: "Принято. Я всё уточню и вернусь к вам в этом чате в ближайшее время.",
	},
};

/**
 * Whether the office has a human reply on the thread: a sent Answer, or a reply from the
 * office's own app. The auto-reply is not one (ADR 0021).
 */
export function officeHasHumanReply(thread: Pick<TemplateThread, "sentAt" | "messages">): boolean {
	return (
		Boolean(thread.sentAt) ||
		thread.messages.some(
			(message) => message.direction === "out" && message.source !== "auto-reply",
		)
	);
}

/**
 * The name the template introduces the agent by: the first word of their account name.
 * A name written family name first (as Vietnamese names are) gives the family name: pending.
 */
export function firstName(name: string | null): string | null {
	return name?.trim().split(/\s+/u)[0] || null;
}

/** The details still missing, in the auto-reply's order (R3). */
function missing(qualification: Qualification): Qualifier[] {
	const known: Record<Qualifier, boolean> = {
		rentOrBuy: Boolean(qualification.rentOrBuy),
		area: Boolean(qualification.areaOfInterest),
		budget: Boolean(qualification.budgetBand),
		timeframe: Boolean(qualification.timeframe),
		household: Boolean(qualification.bedsOrHousehold),
	};
	const order: Qualifier[] = ["rentOrBuy", "area", "budget", "timeframe", "household"];
	return order.filter((qualifier) => !known[qualifier]);
}

/** The one question the template may ask, or null: see the module's rules. */
function nextQuestion(qualification: Qualification, thread: TemplateThread): Qualifier | null {
	const asked = new Set(
		thread.messages
			.filter((message) => message.direction === "out")
			.flatMap((message) => askedIn(message.text)),
	);
	return (
		missing(qualification).find(
			(qualifier) => CHANGES_THE_SEND.includes(qualifier) && !asked.has(qualifier),
		) ?? null
	);
}

/** The template suggested reply in `language`, for the thread as it stands. */
export function replyTemplate(
	language: GuestLanguage,
	qualification: Qualification,
	thread: TemplateThread,
): string {
	const copy = COPY[language];
	if (officeHasHumanReply(thread)) return copy.later;

	const sentences: string[] = [];
	const guest = thread.guestName?.trim() || null;
	const agent = firstName(thread.ownerName);
	const office = thread.officeName?.trim() || null;
	if (office) {
		sentences.push(agent ? copy.introAgent(guest, agent, office) : copy.introOffice(guest, office));
	}
	if (!thread.messages.some((message) => message.direction === "out")) {
		sentences.push(copy.thanks);
	}
	sentences.push(copy.plan(copy.about(qualification.rentOrBuy, qualification.areaOfInterest)));
	const ask = nextQuestion(qualification, thread);
	if (ask) sentences.push(greetingQuestion(language, ask));
	// Japanese runs its sentences together; the others leave a space.
	return sentences.join(language === "ja" ? "" : " ");
}
