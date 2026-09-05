import { extractFromInbound } from "./extract";
import type { Draft, GuestLanguage, OneShot, Paperwork, Qualification } from "./types";

type Clause = { en: string; vi: string; ja: string; ko: string; ru: string };

function clause(q: Qualification): Clause | null {
	const area = q.areaOfInterest;
	const intent =
		q.rentOrBuy === "rent"
			? { en: "renting", vi: "thuê", ja: "賃貸", ko: "임대", ru: "аренде" }
			: q.rentOrBuy === "buy"
				? { en: "buying", vi: "mua", ja: "購入", ko: "매매", ru: "покупке" }
				: null;

	if (intent && area) {
		return {
			en: `${intent.en} in ${area}`,
			vi: `${intent.vi} tại ${area}`,
			ja: `${area}での${intent.ja}`,
			ko: `${area} ${intent.ko}`,
			ru: `${intent.ru} в ${area}`,
		};
	}
	if (intent) return intent;
	if (area) {
		return {
			en: `in ${area}`,
			vi: `tại ${area}`,
			ja: `${area}について`,
			ko: `${area} 관련`,
			ru: `по району ${area}`,
		};
	}
	return null;
}

export function draftReply(language: GuestLanguage, qualification: Qualification): string {
	const about = clause(qualification);
	const templates: Record<GuestLanguage, string> = {
		en: about
			? `Thanks for writing — we received your note about ${about.en}. A colleague will reply here on this same chat.`
			: "Thanks for writing. A colleague will reply here on this same chat.",
		vi: about
			? `Cảm ơn anh/chị đã nhắn. Bên em đã nhận thông tin về ${about.vi}. Đồng nghiệp sẽ trả lời trên đúng chat này ạ.`
			: "Cảm ơn anh/chị đã nhắn. Đồng nghiệp sẽ trả lời trên đúng chat này ạ.",
		ja: about
			? `ご連絡ありがとうございます。${about.ja}のご相談を承りました。担当よりこのチャットでご連絡します。`
			: "ご連絡ありがとうございます。担当よりこのチャットでご連絡します。",
		ko: about
			? `연락 주셔서 감사합니다. ${about.ko} 문의 확인했습니다. 담당자가 이 채팅으로 답변드리겠습니다.`
			: "연락 주셔서 감사합니다. 담당자가 이 채팅으로 답변드리겠습니다.",
		ru: about
			? `Спасибо за сообщение. Мы получили ваш запрос по ${about.ru}. Коллега ответит в этом чате.`
			: "Спасибо за сообщение. Коллега ответит в этом чате.",
	};
	return templates[language];
}

/** Stored crib for persistence. The walk UI formats crib at read time from `inbox.crib` keys. */
export function buildCrib(
	language: GuestLanguage,
	qualification: Qualification,
	paperwork: Paperwork,
): Pick<Draft, "crib" | "cribLanguage"> {
	const q = qualification;
	const lines: string[] = [];
	if (q.nationality) lines.push(`quốc tịch ${q.nationality}`);
	if (q.inVietnamNow === true) lines.push("đang ở Việt Nam");
	if (q.inVietnamNow === false) lines.push("chưa ở Việt Nam");
	if (q.rentOrBuy === "rent") lines.push("thuê");
	if (q.rentOrBuy === "buy") lines.push("mua");
	if (q.timeframe) lines.push(q.timeframe);
	if (q.areaOfInterest) lines.push(q.areaOfInterest);
	if (q.budgetBand) lines.push(q.budgetBand);
	if (q.bedsOrHousehold) lines.push(q.bedsOrHousehold);

	const known = lines.length ? lines.join(", ") : "chưa đủ field từ inbound";
	const cribVi = `Draft trả lời bằng ${language}. Có trong inbound: ${known}. Không hỏi thêm kiểu interviewer.${
		paperwork.mentioned ? " " + paperwork.flag : ""
	}`;

	if (language === "vi") {
		const enBits: string[] = [];
		if (q.nationality) enBits.push(q.nationality);
		if (q.inVietnamNow === true) enBits.push("in VN now");
		if (q.inVietnamNow === false) enBits.push("not in VN");
		if (q.rentOrBuy) enBits.push(q.rentOrBuy);
		if (q.timeframe) enBits.push(q.timeframe);
		if (q.areaOfInterest) enBits.push(q.areaOfInterest);
		if (q.budgetBand) enBits.push(q.budgetBand);
		if (q.bedsOrHousehold) enBits.push(q.bedsOrHousehold);
		const knownEn = enBits.length ? enBits.join(", ") : "nothing extractable yet";
		return {
			crib: `Draft is in Vietnamese. From inbound: ${knownEn}. Not an interviewer.${
				paperwork.mentioned ? " " + paperwork.flag : ""
			}`,
			cribLanguage: "en",
		};
	}

	return { crib: cribVi, cribLanguage: "vi" };
}

export function oneShot(text: string): OneShot {
	const extracted = extractFromInbound(text);
	const reply = draftReply(extracted.language, extracted.qualification);
	const { crib, cribLanguage } = buildCrib(
		extracted.language,
		extracted.qualification,
		extracted.paperwork,
	);
	return {
		...extracted,
		draft: { reply, crib, cribLanguage },
	};
}
