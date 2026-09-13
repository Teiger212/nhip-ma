import { extractFromInbound } from "./extract";
import type { GuestLanguage, OneShot, Qualification } from "./types";

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

export function oneShot(text: string): OneShot {
	const extracted = extractFromInbound(text);
	const reply = draftReply(extracted.language, extracted.qualification);
	return { ...extracted, draft: { reply } };
}
