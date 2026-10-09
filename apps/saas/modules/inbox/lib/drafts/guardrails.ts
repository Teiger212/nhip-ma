import { z } from "zod";

import type { Message } from "../types";
import { DRAFT_MESSAGES } from "./adapter";

/**
 * The post-check behind the model (ADR 0005, ADR 0024). The prompt carries the rules; this is
 * the part that does not trust the prompt. It blocks an answer, never a mention: a draft that
 * states a price, an availability, a viewing time or a legal answer, or writes a number nobody
 * in the thread wrote, is dropped and the template stands. "I'll check the ownership rules for
 * you" passes.
 *
 * Each sentence is read clause by clause. A clause that defers ("I'll check", "em sẽ kiểm
 * tra") states nothing, and neither does a question, unless it proposes a viewing day. A
 * condition or the matter deferred ("if Saturday doesn't work", "whether it has its own pink
 * book") is read with the clause it belongs to, so a deferral covers it; a confirmation beside
 * a deferral ("Next week works, I'll check the time") is its own clause and still blocks (#289).
 * The number rule has no exemption: a deferral can still carry a figure, but only one the guest
 * or the office already wrote in the thread the model read.
 *
 * The statement patterns are English and Vietnamese, the office languages: every model draft
 * has an office-language text, checked as well, so an answer in Japanese, Korean or Russian is
 * caught in its twin. In those three, a paperwork word outside a deferral or a question blocks.
 */

/** A follow-up is a few short sentences; anything longer is not the agent's register. */
export const MAX_FOLLOW_UP_CHARS = 600;

/** The model's answer: the reply in the guest's language and the same reply in the office's. */
export type ModelDraft = { reply: string; officeReply: string };

const modelDraft = z
	.object({ reply: z.string().trim().min(1), office_reply: z.string().trim().min(1) })
	.strict();

/** One code fence around the whole answer, which models often add: read through it. */
const FENCED = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/u;

/**
 * The model's JSON (ADR 0024), or null when it is anything else: then the template stands.
 * Exactly `{"reply", "office_reply"}`, both non-empty strings; one code fence around it is
 * read through, any other text around it is not.
 */
export function parseModelDraft(raw: string | null | undefined): ModelDraft | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	const body = FENCED.exec(trimmed)?.[1] ?? trimmed;
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return null;
	}
	const parsed = modelDraft.safeParse(value);
	return parsed.success
		? { reply: parsed.data.reply, officeReply: parsed.data.office_reply }
		: null;
}

/**
 * The paperwork and ownership vocabulary in the guest languages: a legal answer is about these.
 * The agent answers them by hand; the flag in the operator note says so.
 */
const PAPERWORK_TERMS =
	/pink\s*book|s[ổo]\s*h[ồo]ng|s[ổo]\s*đ[ỏo]|ownership|residency|visa|work\s*permit|lease\s*hold|free\s*hold|sở\s*hữu|giấy\s*tờ|pháp\s*lý|핑크북|소유권|비자|所有権|ピンクブック|ビザ|розов(?:ая|ую)\s+книг|собственност|виз[аы]/iu;

/**
 * A clause that asserts something, in English or Vietnamese: with a paperwork word it is a legal
 * answer ("You will get a sổ hồng"); without one, "Thanks for asking about the pink book" isn't.
 */
const ASSERTS =
	/\b(?:is|are|was|were|will|won't|can|can't|cannot|could|should|may|get|gets|got|have|has|need|needs|require|requires|allowed|eligible|possible|ready|fine|guaranteed?|no problem)\b|(?:^|\s)(?:được|sẽ|là|cần|không cần|không sao|không vấn đề|đầy đủ|có sổ|đã có)(?=\s|$|[,.!?])/iu;

/** A legal answer with no paperwork word: who may own or buy. */
const LEGAL_ANSWER =
	/\bforeigners?\s+(?:can|may|cannot|can't|are allowed|is allowed|are not allowed|are eligible)\b|\byou\s+(?:can|will|could)\s+(?:own|buy|obtain)\b|người nước ngoài\s+(?:được|có thể|không được|không thể)/iu;

/** What a price is called. */
const PRICE_NOUN =
	/\b(?:(?:the|monthly|its|your) rent|rental (?:price|fee|cost)|price|cost|fees?|deposit|service charge|management fee)\b|(?<!\p{L})(?:giá|tiền thuê|tiền nhà|tiền cọc|đặt cọc|phí)(?!\p{L})/iu;
/** A price stated: the noun with a verb that gives it, or an amount. */
const PRICE_STATED =
	/\b(?:is|are|was|will be|would be|comes to|costs?|runs?|starts? at)\b|(?:^|\s)(?:là|khoảng|tầm|chỉ)(?=\s)|[$₫]\s*\d|\d[\d.,]*\s*(?:usd|vnd|vnđ|đồng|đ(?!\p{L})|triệu|tr\b|tỷ|tỉ|million|k\b)/iu;
/** "It costs …", "It's $2,000": a price with no noun. */
const PRICE_BARE =
	/\bcosts?\s+[$₫\d]|\bit(?:'s| is)\s+(?:only\s+|just\s+|about\s+|around\s+)?[$₫]\s*\d/iu;

/** An availability stated, or stock claimed (rule 3). */
const AVAILABILITY =
	/\b(?:is|are|it's|still|currently)\s+(?:still\s+|currently\s+)?(?:available|free|vacant|taken|rented|let|sold|off the market)\b|\b(?:I|we)\s*(?:'ve|\s+have|\s+has|\s+got|\s+'ve got)\s+(?:got\s+)?(?:a|an|some|several|few|a few|two|three|many|one|the)?\s*(?:\w+\s+){0,3}(?:place|apartment|flat|unit|villa|house|studio|options?|listings?|rooms?)\b|còn\s+(?:trống|phòng|căn|nhà)|đã\s+(?:cho thuê|bán|có người thuê|có khách)|hết\s+(?:phòng|căn|nhà)|có sẵn|bên em\s+(?:đang\s+)?có\s+(?:\d+|một|vài|mấy|nhiều)?\s*căn/iu;

/** What a viewing is called: a viewing day is only a viewing day in a draft that talks of one. */
const VIEWING =
	/\b(?:view|viewing|viewings|visit|tour|show you|see (?:it|the (?:place|apartment|flat|unit|villa|house))|come (?:by|over|and see))\b|xem\s+(?:nhà|căn|phòng|trực tiếp)|(?:đi|qua|ghé|đến|tới)\s+xem|dẫn\s+.*\s+xem|lịch xem/iu;

/** A day or a time of day. */
const DAY_OR_TIME =
	/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(?:tomorrow|today|tonight|weekend|noon|midday)\b|\bthis (?:morning|afternoon|evening|week)\b|\bnext (?:week|month)\b|\d\s*(?:am|pm|a\.m\.|p\.m\.|h\b|giờ)|thứ\s+(?:hai|ba|tư|năm|sáu|bảy|[2-7])|chủ nhật|ngày mai|hôm nay|tối nay|cuối tuần|tuần (?:sau|tới|này)|(?:sáng|chiều|tối) (?:mai|nay)/iu;

/** A clause that defers to the agent: it states nothing (ADR 0024). */
const DEFERRAL =
	/\b(?:check|checking|confirm|confirming|find out|look into|looking into|get back|come back to you|verify|double-check|ask the (?:owner|landlord)|let you know)\b|kiểm tra|xác nhận|báo lại|hỏi lại|tìm hiểu|hỏi chủ nhà|phản hồi|確認|お調べ|改めて|확인|알아보|다시 연락|уточн|провер|узна|сообщ|свяж/iu;

/** A sentence, ending at its stop: the question mark tells a question. */
export function sentences(text: string): string[] {
	// A stop ends a sentence only before a space, so "2.8k" and "3.500.000.000" stay whole.
	return text
		.split(/(?<=[.!?])\s+|(?<=[。！？])|\n+/u)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

/**
 * Offering another day later defers the viewing day (#289, Mikhail), but only in a clause that
 * names no day itself: "Saturday at 10 works, or I can arrange another slot" states one.
 */
const RESCHEDULE =
	/\b(?:suggest|propose|offer|find|arrange)\s+(?:another|a different|other)\s+(?:days?|times?|dates?|slots?)\b|(?:đề xuất|hẹn|chọn|sắp xếp)\s+(?:\p{L}+\s+)?(?:ngày|giờ|hôm|buổi)\s+khác/iu;

function defers(clause: string): boolean {
	return DEFERRAL.test(clause) || (RESCHEDULE.test(clause) && !DAY_OR_TIME.test(clause));
}

/**
 * A condition or an indirect question ("if Saturday doesn't work", "for whether it has its own
 * pink book", "nếu…", "liệu…", a Japanese or Korean topic ending in は, について, 은 or 는): it
 * asserts nothing by itself.
 */
const CONDITION =
	/^(?:(?:and|but|so|or)\s+)?(?:if|unless|in case|(?:(?:as\s+)?for|about|regarding|on|as\s+to)?\s*whether)\b|^(?:(?:và|nhưng)\s+)?(?:nếu|liệu|trường hợp)(?!\p{L})|(?:は|について|に関して|에 대해(?:서)?|관련(?:해서)?|[은는])$/iu;

/** The matter a clause is about ("for the pink book", "regarding the fee", "về sổ hồng…"). */
const TOPIC =
	/^(?:(?:and|but|so|or)\s+)?(?:(?:as\s+)?for|about|regarding)\b|^(?:(?:và|nhưng)\s+)?về(?!\p{L})/iu;

/**
 * A clause as the checks read it: its whole text, and the main clause in it, which alone decides
 * whether it defers.
 */
type Clause = { text: string; main: string };

/**
 * A sentence's clauses: a comma, a semicolon or a dash can join a statement to a deferral. A
 * condition, or a topic that states nothing by itself, is read with the main clause after it,
 * and only that main clause's deferral covers it: "If Saturday doesn't work, I'll suggest another
 * day" defers; "If I check with the owner, Saturday works for the viewing", "Regarding the price
 * it's $650, I'll confirm the rest" and "Next week works, I'll check the time" state. Nothing
 * attaches backwards: a condition or topic last in its sentence is read on its own.
 */
function clauses(sentence: string, viewing: boolean): Clause[] {
	const parts = sentence
		.split(/[;:，、]|,\s|\s[–—-]\s/u)
		.map((part) => part.trim())
		.filter(Boolean);
	const joined: Clause[] = [];
	let pending: string[] = [];
	for (const part of parts) {
		const setsUp =
			!defers(part) &&
			(CONDITION.test(part) ||
				(TOPIC.test(part) && !statesAnswer({ text: part, main: part }, viewing)));
		if (setsUp) {
			pending.push(part);
			continue;
		}
		joined.push({ text: [...pending, part].join(", "), main: part });
		pending = [];
	}
	for (const part of pending) joined.push({ text: part, main: part });
	return joined;
}

/**
 * The agent's own promise ("I will", "em sẽ"): an action, not an answer about the place. "I'll
 * prioritise units with clear paperwork" states nothing; "You will get a sổ hồng" does, and so
 * does a promise to hand the paperwork over ("Em sẽ giao sổ hồng cho anh", `HANDS_OVER`).
 */
const OWN_PROMISE =
	/\b(?:I|we)(?:\s+will|'ll|’ll)\b|(?<!\p{L})(?:em|mình|tôi|chúng (?:tôi|em))(?:\s+cũng)?\s+sẽ(?!\p{L})/giu;

/** Getting, issuing or handing over the paperwork: with a paperwork word, a legal answer. */
const HANDS_OVER =
	/\b(?:obtain|obtaining|get|gets|got|receive|transfer|transferring|hand(?:s|ing)?\s+over|deliver|issue|process|sort out|take care of)\b|(?<!\p{L})(?:giao|sang tên|làm sổ|làm giấy|làm thủ tục|lo|chuyển nhượng|cấp)(?!\p{L})/iu;

/**
 * A bare yes in Vietnamese ("Dạ được anh", "Được ạ"): in a draft about a viewing it answers the
 * guest's "… xem được không?" (#289, Hải).
 */
const ASSENT = /^(?:(?:dạ|vâng|ok|okay)\s+)*được(?:\s+(?:ạ|anh|chị|nhé|luôn|rồi))*[\s.!]*$/iu;

/** Whether a clause states an answer the agent gives by hand. */
function statesAnswer({ text: clause, main }: Clause, viewing: boolean): boolean {
	if (defers(main)) return false;
	if (viewing && ASSENT.test(clause)) return true;
	if (PRICE_BARE.test(clause)) return true;
	if (PRICE_NOUN.test(clause) && PRICE_STATED.test(clause)) return true;
	if (AVAILABILITY.test(clause)) return true;
	if (LEGAL_ANSWER.test(clause)) return true;
	if (
		PAPERWORK_TERMS.test(clause) &&
		(HANDS_OVER.test(clause) ||
			ASSERTS.test(clause.replace(OWN_PROMISE, " ")) ||
			!/[a-zà-ỹ]/iu.test(clause))
	) {
		return true;
	}
	return viewing && DAY_OR_TIME.test(clause);
}

const MULTIPLIERS: [RegExp, number][] = [
	[/^\s*(?:k|nghìn|ngàn|thousand)(?!\p{L})/iu, 1e3],
	[/^\s*(?:tr|triệu|trieu|million|mil|m)(?!\p{L})/iu, 1e6],
	[/^\s*(?:tỷ|tỉ|ty|billion|bn)(?!\p{L})/iu, 1e9],
	// Japanese and Korean count in ten-thousands: Kenji's "60億" is the "6 billion" a draft writes.
	[/^\s*[万만]/u, 1e4],
	[/^\s*[億억]/u, 1e8],
];

/** A number as written: digits, with dots or commas between groups. */
const NUMBER = /\d+(?:[.,]\d+)*/gu;

/**
 * The numbers in `text`, each as it is written and, with a multiplier after it, as that reads
 * it ("2.8k" is 2.8 and 2800). A group of three digits after a dot or a comma is a thousands
 * group ("2,800", "3.500.000.000"); anything else after one is a decimal ("2,5 tỷ"). Full-width
 * digits read as digits.
 */
export function numbersIn(text: string): number[][] {
	const normalized = text.normalize("NFKC");
	return [...normalized.matchAll(NUMBER)].map((match) => {
		const [first, ...rest] = match[0].split(/[.,]/u);
		const thousands = rest.length > 0 && rest.every((group) => group.length === 3);
		const value = Number(
			thousands || !rest.length ? first + rest.join("") : `${first}.${rest.join("")}`,
		);
		const after = normalized.slice(match.index + match[0].length);
		const multiplier = MULTIPLIERS.find(([unit]) => unit.test(after))?.[1];
		return multiplier ? [value, Math.round(value * multiplier)] : [value];
	});
}

/**
 * The thread's texts a draft's numbers may come from (#289): every guest message (the guest's
 * details, which the model reads, come from all of them) and every message the model read, the
 * office's included. The agent's "9 giờ" may come back; a number nobody wrote may not.
 */
export function threadTexts(
	messages: ReadonlyArray<Pick<Message, "direction" | "text">>,
): string[] {
	const read = new Set(messages.slice(-DRAFT_MESSAGES));
	return messages
		.filter((message) => message.direction === "in" || read.has(message))
		.map((message) => message.text);
}

/** Whether every number in `text` is one the thread already has, read either way. */
function onlyThreadNumbers(text: string, written: readonly string[]): boolean {
	const values = new Set(written.flatMap((each) => numbersIn(each).flat()));
	return numbersIn(text).every((readings) => readings.some((value) => values.has(value)));
}

/**
 * Returns the draft to store, or `null` when the template must stand instead. `written` are the
 * thread's texts (`threadTexts`): a number in the draft must be one of theirs.
 */
export function checkFollowUp(
	draft: string | null | undefined,
	written: readonly string[],
): string | null {
	if (!draft) {
		return null;
	}
	// Composed (NFC) first, as the guest's phone shows it: a decomposed "sở hữu" is the same
	// word and must not slip past the patterns (ADR 0021, R2).
	const text = draft.normalize("NFC").trim();
	if (!text || text.length > MAX_FOLLOW_UP_CHARS) {
		return null;
	}
	if (
		!onlyThreadNumbers(
			text,
			written.map((each) => each.normalize("NFC")),
		)
	) {
		return null;
	}
	const viewing = VIEWING.test(text);
	for (const sentence of sentences(text)) {
		const parts = clauses(sentence, viewing);
		// A closing quote or bracket after the question mark still ends a question.
		const question = /[?？]["'”’»)\]」]*$/u.test(sentence);
		for (const [index, clause] of parts.entries()) {
			// A question asks; it states nothing, unless it proposes a viewing day. Only the clause
			// the question mark closes is the question: "The rent is $2,000, is that ok?" states.
			if (question && index === parts.length - 1) {
				if (viewing && DAY_OR_TIME.test(clause.text)) return null;
				continue;
			}
			if (statesAnswer(clause, viewing)) return null;
		}
	}
	return text;
}
