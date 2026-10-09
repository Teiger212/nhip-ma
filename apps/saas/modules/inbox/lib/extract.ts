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

export function emptyQualification(): Qualification {
	return {
		areaOfInterest: null,
		nationality: null,
		inVietnamNow: null,
		rentOrBuy: null,
		timeframe: null,
		budgetBand: null,
		bedsOrHousehold: null,
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
		},
		paperwork: {
			mentioned,
			flag: mentioned ? PAPERWORK_FLAG : null,
		},
	};
}
