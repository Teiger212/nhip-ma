/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout): a no-model suggested reply in the
 * agent's own voice, standing in for today's follow-up template ("A colleague will get back to
 * you…"), which repeats the auto-reply and promises a colleague when the sender is that colleague.
 *
 * Rule:
 * - With an auto-reply on the thread (it already thanked the guest and asked its questions):
 *   introduce the agent, say they'll handle the search, and move to substance (options coming).
 *   Ask a detail only if it is missing, the auto-reply did NOT ask it, and it changes what you'd
 *   send (rent/buy, area, budget, household; not move-in).
 * - Without one: introduce the agent, name what the guest asked about, and ask the next missing
 *   detail in the auto-reply's order (greetingAsks); with nothing missing, offer the next step.
 *
 * STUB: the RU / KO / JA / VI wording below is plausible, not reviewed by a native speaker.
 */
import { greetingAsks, MAX_GREETING_QUESTIONS, type Qualifier } from "../../lib/greeting";
import type { Conversation, GuestLanguage, Qualification } from "../../lib/types";

type Lang = GuestLanguage;

/** Details that change which listings you'd send (move-in doesn't, at this stage). */
const CHANGES_THE_SEND: Qualifier[] = ["rentOrBuy", "area", "budget", "household"];
const ORDER: Qualifier[] = ["rentOrBuy", "area", "budget", "timeframe", "household"];

function missingInOrder(q: Qualification): Qualifier[] {
	const missing: Record<Qualifier, boolean> = {
		rentOrBuy: !q.rentOrBuy,
		area: !q.areaOfInterest,
		budget: !q.budgetBand,
		timeframe: !q.timeframe,
		household: !q.bedsOrHousehold,
	};
	return ORDER.filter((k) => missing[k]);
}

type Facts = {
	name: string;
	op: string;
	office: string;
	rent: boolean | null;
	beds: number | "studio" | null;
	area: string | null;
	budget: { usd: number } | { vnd: number } | null;
};

function parseBeds(raw: string | null): Facts["beds"] {
	if (!raw) return null;
	const n = raw.match(/(\d+)\s*bed/);
	if (n) return Number(n[1]);
	return /studio/i.test(raw) ? "studio" : null;
}

function parseBudget(raw: string | null): Facts["budget"] {
	if (!raw) return null;
	const vnd = raw.match(/(\d+(?:[.,]\d+)?)\s*(triệu|tỷ)/i);
	if (vnd) {
		const n = Number(vnd[1].replace(",", "."));
		return { vnd: Math.round(n * (vnd[2].toLowerCase() === "tỷ" ? 1e9 : 1e6)) };
	}
	const usd = raw.match(/\$\s*([\d,]+)/);
	return usd ? { usd: Number(usd[1].replace(/,/g, "")) } : null;
}

const fmt = (n: number, locale = "en-US") => new Intl.NumberFormat(locale).format(n);

function budgetText(f: Facts, lang: Lang): string {
	const b = f.budget;
	if (!b) return "";
	const monthly = f.rent !== false;
	if ("usd" in b) {
		const usd = lang === "vi" ? `${fmt(b.usd, "vi-VN")} USD` : `$${fmt(b.usd)}`;
		return {
			en: `around ${usd}${monthly ? " a month" : ""}`,
			vi: `tầm ${usd}${monthly ? "/tháng" : ""}`,
			ru: `около ${usd}${monthly ? " в месяц" : ""}`,
			ko: `${monthly ? "월 " : ""}${usd} 내외`,
			ja: `${monthly ? "月額" : ""}${usd}前後`,
		}[lang];
	}
	const billions = b.vnd >= 1e9;
	const unit = billions ? b.vnd / 1e9 : b.vnd / 1e6;
	return {
		en: `around ${fmt(unit)} ${billions ? "billion" : "million"} VND${monthly ? " a month" : ""}`,
		vi: `tầm ${fmt(unit, "vi-VN")} ${billions ? "tỷ" : "triệu"}${monthly ? "/tháng" : ""}`,
		ru: `около ${fmt(unit)} ${billions ? "млрд" : "млн"} донгов${monthly ? " в месяц" : ""}`,
		ko: `${monthly ? "월 " : ""}${billions ? `${fmt(unit * 10)}억` : `${fmt(unit * 100)}만`} 동 내외`,
		ja: `${monthly ? "月額" : ""}${billions ? `${fmt(unit * 10)}億` : `${fmt(unit * 100)}万`}ドン前後`,
	}[lang];
}

const QUESTIONS: Record<Lang, Record<Qualifier | "next", string>> = {
	en: {
		rentOrBuy: "are you looking to rent or to buy?",
		area: "which part of Hanoi would suit you best?",
		budget: "what budget do you have in mind?",
		timeframe: "when are you hoping to move in?",
		household: "how many people will be living there?",
		next: "shall I send you a few listings that fit and book a viewing?",
	},
	vi: {
		rentOrBuy: "anh/chị muốn thuê hay mua ạ?",
		area: "anh/chị muốn ở khu vực nào ạ?",
		budget: "ngân sách của anh/chị khoảng bao nhiêu ạ?",
		timeframe: "anh/chị dự định dọn vào khi nào ạ?",
		household: "sẽ có mấy người ở ạ?",
		next: "em gửi anh/chị vài căn phù hợp rồi mình hẹn lịch xem nhà nhé?",
	},
	ru: {
		rentOrBuy: "вы хотите арендовать или купить?",
		area: "какой район вам подходит?",
		budget: "на какой бюджет вы рассчитываете?",
		timeframe: "когда вы планируете въехать?",
		household: "сколько человек будет жить?",
		next: "прислать вам несколько подходящих вариантов и договориться о просмотре?",
	},
	ko: {
		rentOrBuy: "임대와 매매 중 어느 쪽을 원하시나요?",
		area: "어느 지역을 원하시나요?",
		budget: "예산은 어느 정도 생각하고 계신가요?",
		timeframe: "입주는 언제쯤 원하시나요?",
		household: "몇 분이 거주하실 예정인가요?",
		next: "조건에 맞는 매물 몇 곳을 보내드리고 방문 일정을 잡아드릴까요?",
	},
	ja: {
		rentOrBuy: "賃貸とご購入のどちらをご希望でしょうか。",
		area: "ご希望のエリアはございますか。",
		budget: "ご予算はどのくらいをお考えでしょうか。",
		timeframe: "ご入居はいつ頃をご希望でしょうか。",
		household: "何名様でお住まいになりますか。",
		next: "条件に合う物件をいくつかお送りして、内見のご予約をお取りしましょうか。",
	},
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tidy = (s: string) =>
	s
		.replace(/\s+/g, " ")
		.replace(/\s+([,.:?!])/g, "$1")
		.trim();

function compose(
	f: Facts,
	lang: Lang,
	afterAutoReply: boolean,
	ask: Qualifier | "next" | null,
): string {
	const q = ask ? QUESTIONS[lang][ask] : null;
	const budget = budgetText(f, lang);
	switch (lang) {
		case "en": {
			const unit = f.beds === "studio" ? "studio" : f.beds ? `${f.beds}-bedroom` : "";
			const greet = `Hi ${f.name}, I'm ${f.op} from ${f.office}`;
			if (afterAutoReply) {
				const what = tidy(
					`${unit} ${f.rent === false ? "options to buy" : "options"} ${f.area ? `in ${f.area}` : ""} ${budget}`,
				);
				return tidy(
					`${greet} and I'll handle your search. I'll send you a few ${what} shortly.${q ? ` Meanwhile, ${q}` : ""}`,
				);
			}
			const purpose = f.rent === true ? "to rent" : f.rent === false ? "to buy" : "";
			const intent = tidy(
				`${unit ? `a ${unit}` : "a place"} ${purpose} ${f.area ? `in ${f.area}` : ""} ${budget}`,
			);
			const hasIntent = Boolean(unit || purpose || f.area || budget);
			return tidy(`${greet}. ${hasIntent ? `For ${intent}, ${q ?? ""}` : cap(q ?? "")}`);
		}
		case "vi": {
			const unit = f.beds === "studio" ? "studio" : f.beds ? `${f.beds} phòng ngủ` : "";
			const purpose = f.rent === true ? "cho thuê" : f.rent === false ? "đang bán" : "";
			const where = f.area ? `ở ${f.area}` : "";
			const greet = `Chào ${f.name}, em là ${f.op} bên ${f.office}`;
			if (afterAutoReply) {
				return tidy(
					`${greet}, em sẽ hỗ trợ anh/chị tìm nhà ạ. Em sẽ gửi anh/chị vài căn ${unit} ${purpose} ${where} ${budget} ngay ạ.${q ? ` Trong lúc đó, ${q}` : ""}`,
				);
			}
			const hasIntent = Boolean(unit || purpose || f.area || budget);
			return tidy(
				`${greet} ạ. ${hasIntent ? `Về căn ${unit} ${purpose} ${where}${budget ? `, ${budget}` : ""}, ${q ?? ""}` : cap(q ?? "")}`,
			);
		}
		case "ru": {
			const unit =
				f.beds === "studio"
					? "-студии"
					: f.beds
						? ` с ${f.beds} ${f.beds === 1 ? "спальней" : "спальнями"}`
						: "";
			const where = f.area ? `в ${f.area}` : "";
			const greet = `Здравствуйте, ${f.name}! Меня зовут ${f.op}, я из ${f.office}`;
			if (afterAutoReply) {
				const purpose = f.rent === true ? "в аренду" : f.rent === false ? "на продажу" : "";
				return tidy(
					`${greet}, и я буду заниматься вашим поиском. В ближайшее время пришлю вам несколько вариантов${f.beds === "studio" ? " студий" : unit} ${purpose} ${where} ${budget}.${q ? ` А пока подскажите: ${q}` : ""}`,
				);
			}
			const subject =
				f.rent === true ? "аренды квартиры" : f.rent === false ? "покупки квартиры" : "квартиры";
			const hasIntent = Boolean(f.rent !== null || f.beds || f.area || budget);
			return tidy(
				`${greet}. ${hasIntent ? `По поводу ${subject}${unit} ${where} ${budget}: ${q ?? ""}` : cap(q ?? "")}`,
			);
		}
		case "ko": {
			const unit = f.beds === "studio" ? "스튜디오" : f.beds ? `${f.beds}베드룸` : "";
			const purpose = f.rent === true ? "임대" : f.rent === false ? "매매" : "";
			const greet = `안녕하세요 ${f.name}님, ${f.office}의 ${f.op}입니다.`;
			if (afterAutoReply) {
				return tidy(
					`${greet} 앞으로 매물 찾기를 담당하겠습니다. ${budget ? `${budget}의 ` : ""}${f.area ?? ""} ${unit} ${purpose} 매물 몇 곳을 곧 보내드리겠습니다.${q ? ` 그동안 ${q}` : ""}`,
				);
			}
			const hasIntent = Boolean(unit || purpose || f.area);
			return tidy(
				`${greet} ${hasIntent ? `${f.area ?? ""} ${unit} ${purpose}${budget ? `(${budget})` : ""} 관련해서, ${q ?? ""}` : (q ?? "")}`,
			);
		}
		case "ja": {
			const unit = f.beds === "studio" ? "スタジオ" : f.beds ? `${f.beds}ベッドルーム` : "";
			const purpose = f.rent === true ? "賃貸" : f.rent === false ? "購入" : "";
			const greet = `${f.name}様、${f.office}の${f.op}です。`;
			if (afterAutoReply) {
				return `${greet}今後のお部屋探しを担当いたします。${budget}${f.area ? `${f.area}の` : ""}${unit}${purpose}物件をいくつか、追ってお送りします。${q ? `その間に、${q}` : ""}`;
			}
			const hasIntent = Boolean(unit || purpose || f.area);
			return `${greet}${hasIntent ? `${f.area ? `${f.area}の` : ""}${unit}${purpose}${budget ? `（${budget}）` : ""}について、${q ?? ""}` : (q ?? "")}`;
		}
	}
}

/**
 * The suggested reply in `lang`: call it with the guest's language for the box and with the
 * operator's for the line under it. `null` when the thread has no extraction yet.
 */
export function suggestReply(
	conversation: Conversation,
	lang: Lang,
	operator: { firstName: string; office: string },
): string | null {
	const q = conversation.oneShot?.qualification;
	if (!q) return null;
	const facts: Facts = {
		name: conversation.guestName || conversation.guestId,
		op: operator.firstName,
		office: operator.office,
		rent: q.rentOrBuy ? q.rentOrBuy === "rent" : null,
		beds: parseBeds(q.bedsOrHousehold),
		area: q.areaOfInterest,
		budget: parseBudget(q.budgetBand),
	};
	const missing = missingInOrder(q);
	const afterAutoReply = conversation.messages.some((m) => m.source === "auto-reply");
	let ask: Qualifier | "next" | null;
	if (afterAutoReply) {
		const askedByAutoReply = greetingAsks(q).slice(0, MAX_GREETING_QUESTIONS);
		ask =
			missing.find((k) => !askedByAutoReply.includes(k) && CHANGES_THE_SEND.includes(k)) ?? null;
	} else {
		ask = missing[0] ?? "next";
	}
	return compose(facts, lang, afterAutoReply, ask);
}
