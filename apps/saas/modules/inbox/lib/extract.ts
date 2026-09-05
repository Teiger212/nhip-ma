import { detectLanguage } from "./language";
import type { Qualification } from "./types";

function bounded(source: string): RegExp {
	return new RegExp(`(?<![A-Za-z])(?:${source})(?![A-Za-z])`, "iu");
}

const AREAS: Array<{ id: string; re: RegExp }> = [
	{ id: "Tây Hồ", re: bounded("tay\\s*ho|tây\\s*hồ|west\\s*lake") },
	{ id: "Ba Đình", re: bounded("ba\\s*dinh|ba\\s*đình") },
	{ id: "Hoàn Kiếm", re: bounded("hoan\\s*kiem|hoàn\\s*kiếm|old\\s*quarter") },
	{ id: "Cầu Giấy", re: bounded("cau\\s*giay|cầu\\s*giấy") },
	{ id: "Đống Đa", re: bounded("dong\\s*da|đống\\s*đa") },
	{ id: "Hai Bà Trưng", re: bounded("hai\\s*ba\\s*trung|hai\\s*bà\\s*trưng") },
	{ id: "Long Biên", re: bounded("long\\s*bien|long\\s*biên") },
	{ id: "Ciputra", re: bounded("ciputra") },
	{ id: "Vinhomes", re: bounded("vinhomes|vinhom") },
	{ id: "Times City", re: bounded("times\\s*city") },
	{ id: "Landmark", re: bounded("landmark\\s*\\d*") },
	{ id: "Ecopark", re: bounded("ecopark") },
	{ id: "Hà Nội", re: bounded("ha\\s*noi|hà\\s*nội|hanoi") },
];

const NATIONALITIES: Array<{ id: string; re: RegExp }> = [
	{ id: "Japanese", re: /日本人|(?<!\p{L})(?:japanese|japan|người\s*nhật|nhật\s*bản)(?!\p{L})/iu },
	{ id: "Korean", re: /한국인|(?<!\p{L})(?:korean|korea|người\s*hàn|hàn\s*quốc)(?!\p{L})/iu },
	{ id: "Russian", re: bounded("russian|russia|người\\s*nga|русский|росси") },
	{ id: "American", re: bounded("american|usa|u\\.s\\.|người\\s*mỹ") },
	{ id: "British", re: bounded("british|english\\s+(guest|client)|người\\s*anh") },
	{ id: "French", re: bounded("french|france|người\\s*pháp") },
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

function inferTimeframe(text: string): string | null {
	const patterns = [
		/\b(?:this|next)\s+(?:mon(?:day)?|tues(?:day)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i,
		/\b(?:this|next)\s+(?:week|month|weekend)\b/i,
		/\b(?:today|tomorrow|tonight)\b/i,
		/\bin\s+\d+\s+(?:days?|weeks?|months?)\b/i,
		/\b(?:early|mid|late|end of)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i,
		/\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i,
		/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
		/(?:đầu|cuối|giữa)\s+tháng(?:\s+\d+)?/i,
		/tháng\s+(?:sau|\d+)/i,
		/tuần\s+sau/i,
		/ngày\s+\d{1,2}/i,
		/이번\s*(?:주|달|금요일)|다음\s*(?:주|달)/,
		/今週|来週|来月|今月/,
		/на этой неделе|в следующем месяце/,
	];
	for (const re of patterns) {
		const match = text.match(re);
		if (match) return match[0].replace(/\s+/g, " ").trim();
	}
	return null;
}

function inferBudget(text: string): string | null {
	const match = text.match(
		/(?:\$|usd|us\$)\s*([0-9][0-9,.]*)(?:\s*\/\s*(month|mo|tháng))?|([0-9][0-9,.]*)\s*(usd|dollars|\$|triệu|trieu|tỷ|ty|million)(?:\s*\/\s*(month|mo|tháng))?/i,
	);
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
	language: ReturnType<typeof detectLanguage>;
	qualification: Qualification;
	paperwork: { mentioned: boolean; flag: string | null };
} {
	const inbound = String(text || "").trim();
	const language = detectLanguage(inbound);
	if (!inbound) {
		return {
			language,
			qualification: emptyQualification(),
			paperwork: { mentioned: false, flag: null },
		};
	}

	const mentioned = PAPERWORK_RE.test(inbound);
	return {
		language,
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
