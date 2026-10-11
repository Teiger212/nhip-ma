import { AREAS, bounded } from "./areas";
import { identifyLanguage } from "./language";
import { isSupportedLanguage } from "./language-name";
import type { GuestLanguage, Qualification } from "./types";

const NATIONALITIES: Array<{ id: string; re: RegExp }> = [
	{ id: "Japanese", re: /日本人|(?<!\p{L})(?:japanese|japan|người\s*nhật|nhật\s*bản)(?!\p{L})/iu },
	{ id: "Korean", re: /한국인|(?<!\p{L})(?:korean|korea|người\s*hàn|hàn\s*quốc)(?!\p{L})/iu },
	{ id: "Russian", re: bounded("russian|russia|người\\s*nga|русский|росси") },
	{ id: "American", re: bounded("american|usa|u\\.s\\.|người\\s*mỹ") },
	{ id: "British", re: bounded("british|english\\s+(guest|client)|người\\s*anh") },
	// "française" too (#243): the boundary is ASCII, so the longer forms come first.
	{ id: "French", re: bounded("french|france|fran[cç]aises?|fran[cç]ais|người\\s*pháp") },
	{ id: "German", re: bounded("german|germany|người\\s*đức") },
	{ id: "Chinese", re: bounded("chinese|china|người\\s*trung|trung\\s*quốc") },
	{ id: "Singaporean", re: bounded("singaporean|singapore") },
	{ id: "Australian", re: bounded("australian|australia") },
	{ id: "Canadian", re: bounded("canadian|canada") },
];

const PAPERWORK_RE = bounded(
	"pink\\s*book|so\\s*hong|sổ\\s*hồng|sổ\\s*đỏ|so\\s*do|ownership|own\\s+as\\s+a\\s+foreigner|foreigner[s]?\\s+(buy|own|ownership)|legal\\s+(title|ownership|paper)|visa|residency|work\\s+permit|sở\\s*hữu|người\\s*nước\\s*ngoài\\s*mua|giấy\\s*tờ|pháp\\s*lý|소유권|핑크북|розов(?:ая|ую)\\s+книг",
);

export const PAPERWORK_FLAG =
	"Guest mentioned paperwork or ownership. Do not invent Vietnamese law. Do not promise a pink book / sổ hồng.";

function firstMatch(list: Array<{ id: string; re: RegExp }>, text: string): string | null {
	for (const item of list) {
		if (item.re.test(text)) return item.id;
	}
	return null;
}

function inferInVietnamNow(text: string): boolean | null {
	const no = bounded(
		"not\\s+in\\s+(vietnam|viet\\s*nam|hanoi|ha\\s*noi)|outside\\s+vietnam|flying\\s+in|arriving|coming\\s+next|planning\\s+to\\s+visit|will\\s+visit|sắp\\s+sang|chưa\\s+ở",
	).test(text);
	const yes = bounded(
		"in\\s+(hanoi|ha\\s*noi|vietnam|viet\\s*nam)|currently\\s+in|i'?m\\s+here|đang\\s+ở|ở\\s+(hà\\s*nội|việt\\s*nam|hanoi)|ハノイにいます|하노이에|в\\s+ханое",
	).test(text);
	if (no && !yes) return false;
	if (yes && !no) return true;
	return null;
}

function inferRentOrBuy(text: string): Qualification["rentOrBuy"] {
	const rent =
		/賃貸|임대|월세/.test(text) ||
		bounded("rent|rental|lease|monthly\\s+stay|thuê").test(text) ||
		/аренд/.test(text);
	const buy =
		/購入|구매/.test(text) || bounded("buy|buying|purchase|mua").test(text) || /покуп/.test(text);
	if (rent && buy) return null;
	if (rent) return "rent";
	if (buy) return "buy";
	return null;
}

/** A month's English name or abbreviation, whole: "dec", "Dec", "December"; never "decent". */
const MONTH =
	"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** The move-in forms, most precise first; the guest details read each one back (#243). */
const MOVE_IN_PATTERNS: RegExp[] = [
	/\b(?:this|next)\s+(?:mon(?:day)?|tues(?:day)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi,
	/\b(?:this|next)\s+(?:week|month|weekend)\b/gi,
	/\b(?:today|tomorrow|tonight)\b/gi,
	/\bin\s+\d+\s+(?:days?|weeks?|months?)\b/gi,
	new RegExp(`\\b(?:early|mid|late|end of)\\s+(?:${MONTH})\\b`, "gi"),
	new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH})\\b`, "gi"),
	new RegExp(`\\b(?:${MONTH})\\.?\\s+\\d{1,2}\\b`, "gi"),
	// "in December", "from March" (#243), after the forms that name a day or a part of the month.
	new RegExp(`\\b(?:in|from)\\s+(?:${MONTH})\\b`, "gi"),
	/(?:đầu|cuối|giữa)\s+tháng(?:\s+\d+)?/gi,
	/tháng\s+(?:sau|\d+)/gi,
	/tuần\s+sau/gi,
	/ngày\s+\d{1,2}/gi,
	/이번\s*(?:주|달|금요일)|다음\s*(?:주|달)/g,
	/今週|来週|来月|今月/g,
	/на этой неделе|в следующем месяце/gi,
];

/**
 * A word for viewing a place (#243): a day beside it is when the guest wants to look, not when
 * they move in. Plain substrings for the non-Latin words, as `\b` is ASCII-only. "보다" is also
 * Korean for "than" (a pre-MVP edge case, left).
 */
const VIEWING_RE =
	/\b(?:view(?:ing|s)?|visit(?:ing)?|tour|visite[rz]?)\b|(?<!\p{L})xem(?!\p{L})|посмотр|просмотр|보다|보러|구경|見学|内見|内覧/iu;

/** A clause ends at the guest's punctuation or at a new message (they are joined by "\n"). */
const CLAUSE_BREAK = /[,.;!?\n。、，！？]/;

/** The clause around a match: from the last break before it to the next one after it. */
function clauseAround(text: string, index: number, length: number): string {
	let start = index;
	while (start > 0 && !CLAUSE_BREAK.test(text[start - 1] ?? "")) start--;
	let end = index + length;
	while (end < text.length && !CLAUSE_BREAK.test(text[end] ?? "")) end++;
	return text.slice(start, end);
}

/**
 * The move-in, as the guest wrote it: the first match, in pattern order, whose clause names no
 * viewing. "Is a viewing possible this Saturday?" and "на этой неделе хотим посмотреть" are
 * when the guest wants to look; the next match, or the next pattern, is read instead (#243).
 */
function inferTimeframe(text: string): string | null {
	for (const re of MOVE_IN_PATTERNS) {
		for (const match of text.matchAll(re)) {
			if (VIEWING_RE.test(clauseAround(text, match.index, match[0].length))) continue;
			return match[0].replace(/\s+/g, " ").trim();
		}
	}
	return null;
}

/** An amount ends on a digit, so "budget $3500." keeps no full stop (#243). */
const AMOUNT = "[0-9](?:[0-9,.]*[0-9])?";

const BUDGET_RE = new RegExp(
	`(?:\\$|usd|us\\$)\\s*(${AMOUNT})(?:\\s*\\/\\s*(month|mo|tháng))?|(${AMOUNT})\\s*(usd|dollars|\\$|triệu|trieu|tỷ|ty|million)(?:\\s*\\/\\s*(month|mo|tháng))?`,
	"i",
);

function inferBudget(text: string): string | null {
	const match = text.match(BUDGET_RE);
	if (!match) return null;
	return match[0].replace(/\s+/g, " ").trim();
}

function inferBedsOrHousehold(text: string): string | null {
	const parts: string[] = [];
	const beds = text.match(/(\d+)\s*[- ]?(bed(?:room)?s?|br\b|pn\b|phòng\s*ngủ|phong\s*ngu|ngủ)/i);
	if (beds) parts.push(`${beds[1]} bed`);
	if (/\bstudio\b/i.test(text)) parts.push("studio");
	const family = text.match(/\bfamily\s+of\s+(\d+)\b/i);
	if (family) parts.push(`family of ${family[1]}`);
	const people = text.match(/\b(\d+)\s*(people|persons|pax|người)\b/i);
	if (people) parts.push(`${people[1]} people`);
	if (/\bcouple\b/i.test(text)) parts.push("couple");
	const kids = text.match(/\b(\d+)\s*(kids?|children|con)\b/i);
	if (kids) parts.push(`${kids[1]} kids`);
	return parts.length ? parts.join(", ") : null;
}

/* ---------------------------------------------------------------- stay length (#317) */

type StayUnit = "night" | "week" | "month" | "year";

/**
 * A count of one or two digits, or a range of them: "6", "6-12", "6~12", "6 to 12", "6 до 12".
 * Never the end of a longer number or an amount ("2026년", "$1,500").
 */
const COUNT = "(?<![\\p{L}\\d.,$])(\\d{1,2})(?:\\s*(?:-|–|—|~|〜|to|đến|до)\\s*(\\d{1,2}))?";

/** A unit as the guest wrote it, in any of the languages below. */
function stayUnit(word: string): StayUnit | null {
	const unit = word.toLocaleLowerCase();
	if (/^(?:nights?|đêm|박|泊|ноч)/u.test(unit)) return "night";
	if (/^(?:weeks?|tuần|주|週|недел)/u.test(unit)) return "week";
	if (/^(?:months?|tháng|개월|달|[ヶケかカヵ箇]月|мес)/u.test(unit)) return "month";
	if (/^(?:years?|yrs?|năm|년|年|год|лет)/u.test(unit)) return "year";
	return null;
}

/** One stay length as stored, in English like the household: "3 nights", "1 year", "6–12 months". */
function stayPiece(unit: StayUnit | null, from: string | undefined, to?: string): string | null {
	if (!unit) return null;
	const first = from === "một" ? 1 : Number(from ?? 1);
	if (!Number.isInteger(first) || first < 1) return null;
	if (to !== undefined) {
		const last = Number(to);
		return last > first ? `${first}–${last} ${unit}s` : null;
	}
	return `${first} ${unit}${first === 1 ? "" : "s"}`;
}

/** A counted stay: groups 1 and 2 are the count or range, and group 3 the unit, unless `unit` names it. */
function counted(unit?: StayUnit) {
	return (match: RegExpMatchArray) =>
		stayPiece(unit ?? stayUnit(match[3] ?? ""), match[1], match[2]);
}

const MONTHLY = () => "monthly";

/** Not a letter on either side, for the scripts `\b` doesn't know. */
const word = (source: string) => `(?<!\\p{L})(?:${source})(?!\\p{L})`;

/**
 * The guest's stay length, each pattern with how it reads (#317). A number of nights is always a
 * stay; a number of weeks, months or years only beside a word that makes it one ("for 6 months",
 * "12-month lease", "thuê 1 năm", "6개월", "1年間", "на год"), so a move-in ("in 3 weeks",
 * "3개월 후") or a budget ("$1,500 a month", "12 triệu một tháng") never reads as one. 월세 is a
 * kind of lease, not a length, and "monthly rent" is mostly a price: neither is "monthly".
 */
const STAY_PATTERNS: Array<{ re: RegExp; read: (match: RegExpMatchArray) => string | null }> = [
	// English.
	{
		re: new RegExp(
			`${word("for")}\\s+(?:about\\s+|around\\s+|roughly\\s+)?${COUNT}[\\s-]*(nights?|weeks?|months?|years?|yrs?)(?!\\p{L})`,
			"giu",
		),
		read: counted(),
	},
	{
		re: new RegExp(
			`${COUNT}[\\s-]*(nights?|weeks?|months?|years?|yrs?)\\s+(?:stay|lease|rental|contract|tenancy|let|term)(?!\\p{L})`,
			"giu",
		),
		read: counted(),
	},
	{ re: new RegExp(`${COUNT}\\s*nights?(?!\\p{L})`, "giu"), read: counted("night") },
	{
		re: new RegExp(
			`${word("for\\s+(?:a|one)\\s+(year)|(?:a|one)[\\s-]+(year|month)\\s+(?:lease|contract|stay|rental)")}`,
			"giu",
		),
		read: (match) => stayPiece(stayUnit(match[1] ?? match[2] ?? ""), "1"),
	},
	{
		re: new RegExp(
			word(
				"monthly\\s+(?:stay|rental|lease|basis|let)(?!\\s+(?:price|cost|fee|rate|budget|of))|month[\\s-]to[\\s-]month|by\\s+the\\s+month",
			),
			"giu",
		),
		read: MONTHLY,
	},
	// Vietnamese: "thuê 6 tháng", "ở 3 đêm", "trong 6-12 tháng", "hợp đồng 1 năm", "thuê theo tháng";
	// not a date ("ngày 15 tháng 12") nor a move-in or the past ("trong 2 tuần tới", "1 năm qua").
	{
		re: new RegExp(
			`${word("thuê|ở|trong|hợp\\s*đồng")}\\s+(?:khoảng\\s+|tầm\\s+)?(\\d{1,2}|một)(?:\\s*(?:-|–|~|đến)\\s*(\\d{1,2}))?\\s*(đêm|tuần|tháng|năm)(?!\\p{L})(?!\\s*(?:\\d|tới|nữa|qua|trước|sau))`,
			"giu",
		),
		read: counted(),
	},
	{ re: new RegExp(`${COUNT}\\s*đêm(?!\\p{L})`, "giu"), read: counted("night") },
	{ re: new RegExp(`${word("thuê|ở")}\\s+theo\\s+tháng(?!\\p{L})`, "giu"), read: MONTHLY },
	// Korean: "3박", "6개월" (not "3개월 후", in three months), "1년 계약", "2주 동안", "한 달 살기".
	{ re: new RegExp(`${COUNT}\\s*박`, "gu"), read: counted("night") },
	{
		re: new RegExp(`${COUNT}\\s*개월(?!\\s*(?:후|뒤|안|이내|전))`, "gu"),
		read: counted("month"),
	},
	{ re: new RegExp(`${COUNT}\\s*(주|년)\\s*(?:동안|간|계약|살기)`, "gu"), read: counted() },
	{ re: /한\s*달\s*(?:동안|간|살기)/gu, read: () => stayPiece("month", "1") },
	// Japanese: "3泊", "6ヶ月" (not "3ヶ月後"), "2週間", "1年間", "1年契約", "マンスリー".
	{ re: new RegExp(`${COUNT}\\s*泊`, "gu"), read: counted("night") },
	{
		re: new RegExp(
			`${COUNT}\\s*([ヶケかカヵ箇]月|週間|年間|年(?=\\s*契約))(?!\\s*(?:後|以内|前))`,
			"gu",
		),
		read: counted(),
	},
	{ re: /マンスリー|月単位/gu, read: MONTHLY },
	// Russian: "3 ночи", "на 6 месяцев", "на 1-2 года", "на год", "помесячно".
	{ re: new RegExp(`${COUNT}\\s*(ноч\\p{L}*)`, "giu"), read: counted() },
	{
		re: new RegExp(
			`${word("на")}\\s+${COUNT}\\s*(недел\\p{L}*|месяц\\p{L}*|мес|год\\p{L}*|лет)(?!\\p{L})`,
			"giu",
		),
		read: counted(),
	},
	{
		re: new RegExp(`${word("на")}\\s+(неделю|месяц|год)(?!\\p{L})`, "giu"),
		read: (match) => stayPiece(stayUnit(match[1] ?? ""), "1"),
	},
	{ re: new RegExp(word("помесячн\\p{L}*"), "giu"), read: MONTHLY },
];

/**
 * A clause that is about where the guest is now, or about money held, names no stay: "currently in
 * Hanoi for 2 weeks", "đang ở Hà Nội 2 tuần", "a deposit of 2 months".
 */
const NOT_A_STAY_RE =
	/(?<!\p{L})(?:currently|already|been|deposit|notice|(?:i'?m|i\s+am|we'?re|we\s+are)\s+(?:here|in))(?!\p{L})|đang\s+ở|hiện\s+ở|(?<!\p{L})cọc(?!\p{L})|보증금|敷金|сейчас|залог|депозит/iu;

/**
 * How long the guest wants to stay, from their own words only: every length they named, in the
 * order they wrote them, once each, joined with "or" ("3 nights or monthly"). Never inferred.
 */
function inferStayLength(text: string): string | null {
	const found: Array<{ start: number; end: number; piece: string }> = [];
	for (const { re, read } of STAY_PATTERNS) {
		for (const match of text.matchAll(re)) {
			const start = match.index;
			const end = start + match[0].length;
			if (found.some((taken) => start < taken.end && end > taken.start)) continue;
			if (NOT_A_STAY_RE.test(clauseAround(text, start, match[0].length))) continue;
			const piece = read(match);
			if (piece) found.push({ start, end, piece });
		}
	}
	const pieces = [...new Set(found.sort((a, b) => a.start - b.start).map((each) => each.piece))];
	return pieces.length ? pieces.join(" or ") : null;
}

export function emptyQualification(): Qualification {
	return {
		areaOfInterest: null,
		nationality: null,
		inVietnamNow: null,
		rentOrBuy: null,
		timeframe: null,
		budgetBand: null,
		bedsOrHousehold: null,
		stayLength: null,
	};
}

export function extractFromInbound(text: string): {
	language: GuestLanguage;
	guestLanguage: string;
	qualification: Qualification;
	paperwork: { mentioned: boolean; flag: string | null };
} {
	// Composed (NFC), as the patterns are: a decomposed "Tây Hồ" is still Tây Hồ.
	const inbound = String(text || "")
		.normalize("NFC")
		.trim();
	// The guest language, named (#245); Nhịp writes in it if supported, else in English.
	const guestLanguage = identifyLanguage(inbound);
	const language = isSupportedLanguage(guestLanguage) ? guestLanguage : "en";
	if (!inbound) {
		return {
			language,
			guestLanguage,
			qualification: emptyQualification(),
			paperwork: { mentioned: false, flag: null },
		};
	}

	const mentioned = PAPERWORK_RE.test(inbound);
	return {
		language,
		guestLanguage,
		qualification: {
			areaOfInterest: firstMatch(AREAS, inbound),
			nationality: firstMatch(NATIONALITIES, inbound),
			inVietnamNow: inferInVietnamNow(inbound),
			rentOrBuy: inferRentOrBuy(inbound),
			timeframe: inferTimeframe(inbound),
			budgetBand: inferBudget(inbound),
			bedsOrHousehold: inferBedsOrHousehold(inbound),
			stayLength: inferStayLength(inbound),
		},
		paperwork: {
			mentioned,
			flag: mentioned ? PAPERWORK_FLAG : null,
		},
	};
}
