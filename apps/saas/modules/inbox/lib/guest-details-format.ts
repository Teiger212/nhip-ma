import type { ExtractFieldId } from "./extract-rows";

/**
 * The guest's details as the office reads them (#243, #96): the move-in, budget, nationality and
 * household the extractor stored as the guest wrote them ("tuần sau", "$3500.", "Russian",
 * "3 bed, family of 4"), put in the office language at render. Nothing stored changes, so old
 * threads read the same way. Safe for the client: pure, no `@repo/database` at runtime.
 *
 * A value it doesn't know reads as stored, never empty. The model prompt keeps the stored values.
 */

/** `t` over the `inbox.*` messages, as the operator note takes it (`CribTranslate`). */
export type DetailTranslate = (key: string, values?: Record<string, string>) => string;

/** Whitespace collapsed and lower-cased, as the patterns below are written. */
function normalized(raw: string): string {
	return raw.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/* ---------------------------------------------------------------- months and weekdays */

const MONTH_PREFIXES = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
] as const;

const WEEKDAY_PREFIXES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** The extractor's month forms, whole (`extract.ts`): "dec", "dec.", "december". */
const MONTH =
	"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** A month's index, 0 to 11, from an English name or abbreviation. */
function monthIndex(word: string): number {
	return MONTH_PREFIXES.indexOf(word.slice(0, 3) as (typeof MONTH_PREFIXES)[number]);
}

/** A month's name: "December"; in Vietnamese "tháng 12", to follow a word ("Đầu tháng 12"). */
function monthName(index: number, lang: string): string {
	const name = new Intl.DateTimeFormat(lang, { month: "long", timeZone: "UTC" }).format(
		Date.UTC(2024, index, 1),
	);
	return lang === "vi" ? name.toLocaleLowerCase("vi") : name;
}

/** A weekday's name, Monday first: "Saturday", "Thứ Bảy". 1 January 2024 was a Monday. */
function weekdayName(index: number, lang: string): string {
	return new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(
		Date.UTC(2024, 0, 1 + index),
	);
}

/** "1st", "2nd", "15th": the English ordinal of a day of the month. */
function englishOrdinal(day: number): string {
	const suffix = { one: "st", two: "nd", few: "rd", other: "th" } as const;
	const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(day);
	return `${day}${suffix[rule as keyof typeof suffix] ?? "th"}`;
}

function validDay(day: number): boolean {
	return Number.isInteger(day) && day >= 1 && day <= 31;
}

/* ---------------------------------------------------------------- move-in */

/** Phrases the extractor stores as they are, each a key under `detailValues.moveIn`. */
const MOVE_IN_PHRASES: Record<string, string> = {
	"this week": "thisWeek",
	"next week": "nextWeek",
	"this month": "thisMonth",
	"next month": "nextMonth",
	"this weekend": "thisWeekend",
	"next weekend": "nextWeekend",
	today: "today",
	tomorrow: "tomorrow",
	tonight: "tonight",
	"tuần sau": "nextWeek",
	"tháng sau": "nextMonth",
	이번주: "thisWeek",
	이번달: "thisMonth",
	다음주: "nextWeek",
	다음달: "nextMonth",
	今週: "thisWeek",
	来週: "nextWeek",
	今月: "thisMonth",
	来月: "nextMonth",
	"на этой неделе": "thisWeek",
	"в следующем месяце": "nextMonth",
};

const PART_OF_MONTH: Record<string, string> = {
	early: "earlyMonth",
	mid: "midMonth",
	late: "lateMonth",
	"end of": "endOfMonth",
	đầu: "earlyMonth",
	giữa: "midMonth",
	cuối: "lateMonth",
};

const PART_OF_ANY_MONTH: Record<string, string> = {
	đầu: "earlyInMonth",
	giữa: "midInMonth",
	cuối: "lateInMonth",
};

function formatMoveIn(raw: string, lang: string, t: DetailTranslate): string | null {
	const text = normalized(raw);
	const phrase = MOVE_IN_PHRASES[text] ?? MOVE_IN_PHRASES[text.replace(/ /g, "")];
	if (phrase) return t(`detailValues.moveIn.${phrase}`);

	const weekday = text.match(/^(this|next) ([a-z]+)$/);
	if (weekday) {
		const index = WEEKDAY_PREFIXES.indexOf(
			weekday[2].slice(0, 3) as (typeof WEEKDAY_PREFIXES)[number],
		);
		if (index >= 0) {
			return t(`detailValues.moveIn.${weekday[1]}Weekday`, { weekday: weekdayName(index, lang) });
		}
	}
	// 이번 금요일: this Friday.
	if (text.replace(/ /g, "") === "이번금요일") {
		return t("detailValues.moveIn.thisWeekday", { weekday: weekdayName(4, lang) });
	}

	const inCount = text.match(/^in (\d+) (day|week|month)s?$/);
	if (inCount) {
		const count = Number(inCount[1]);
		const unit = { day: "Days", week: "Weeks", month: "Months" }[inCount[2] as "day"];
		return t(`detailValues.moveIn.in${unit}${count === 1 ? "One" : ""}`, { count: String(count) });
	}

	const part = text.match(new RegExp(`^(early|mid|late|end of) (${MONTH})$`));
	if (part) {
		return t(`detailValues.moveIn.${PART_OF_MONTH[part[1]]}`, {
			month: monthName(monthIndex(part[2]), lang),
		});
	}

	// "1 dec" or "dec 1".
	const dayFirst = text.match(new RegExp(`^(\\d{1,2}) (${MONTH})$`));
	const monthFirst = text.match(new RegExp(`^(${MONTH})\\.? (\\d{1,2})$`));
	const day = Number(dayFirst?.[1] ?? monthFirst?.[2]);
	const dayMonthWord = dayFirst?.[2] ?? monthFirst?.[1];
	if (dayMonthWord && validDay(day)) {
		return t("detailValues.moveIn.dayMonth", {
			day: String(day),
			month: monthName(monthIndex(dayMonthWord), lang),
		});
	}

	const inMonth = text.match(new RegExp(`^(in|from) (${MONTH})$`));
	if (inMonth) {
		return t(`detailValues.moveIn.${inMonth[1]}Month`, {
			month: monthName(monthIndex(inMonth[2]), lang),
		});
	}

	// Vietnamese: "đầu tháng 9", "cuối tháng", "tháng 12", "ngày 15".
	const viPart = text.match(/^(đầu|giữa|cuối) tháng(?: (\d{1,2}))?$/);
	if (viPart) {
		if (!viPart[2]) return t(`detailValues.moveIn.${PART_OF_ANY_MONTH[viPart[1]]}`);
		const month = Number(viPart[2]) - 1;
		if (month >= 0 && month <= 11) {
			return t(`detailValues.moveIn.${PART_OF_MONTH[viPart[1]]}`, {
				month: monthName(month, lang),
			});
		}
		return null;
	}
	const viMonth = text.match(/^tháng (\d{1,2})$/);
	if (viMonth) {
		const month = Number(viMonth[1]) - 1;
		if (month >= 0 && month <= 11) {
			return t("detailValues.moveIn.inMonth", { month: monthName(month, lang) });
		}
		return null;
	}
	const viDay = text.match(/^ngày (\d{1,2})$/);
	if (viDay && validDay(Number(viDay[1]))) {
		return t("detailValues.moveIn.dayOfMonth", {
			day: viDay[1],
			ordinal: englishOrdinal(Number(viDay[1])),
		});
	}
	return null;
}

/* ---------------------------------------------------------------- budget */

/**
 * An amount as written: "3500", "3,500" and "3.500" (thousands), "1.5" and "1,5" (a decimal,
 * one or two digits after the mark). A trailing full stop or comma is the sentence's. Null for
 * anything else ("1,50,000").
 */
function parseAmount(written: string): number | null {
	const digits = written.replace(/[.,]+$/, "");
	if (/^\d+$/.test(digits)) return Number(digits);
	if (/^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/.test(digits))
		return Number(digits.replace(/[.,]/g, ""));
	if (/^\d+[.,]\d{1,2}$/.test(digits)) return Number(digits.replace(",", "."));
	return null;
}

const USD = new Set(["$", "usd", "us$", "dollars"]);
const UNIT_KEY: Record<string, string> = {
	triệu: "vndMillion",
	trieu: "vndMillion",
	tỷ: "vndBillion",
	ty: "vndBillion",
	million: "million",
};

function formatBudget(raw: string, lang: string, t: DetailTranslate): string | null {
	const text = normalized(raw);
	// "$3,000/month", "usd 2000" or "15 triệu", "3 tỷ", "1200 dollars / mo".
	const prefixed = text.match(/^(\$|usd|us\$) ?([0-9][0-9,.]*) ?(?:\/ ?(month|mo|tháng))?$/);
	const suffixed = text.match(
		/^([0-9][0-9,.]*) ?(usd|dollars|\$|triệu|trieu|tỷ|ty|million) ?(?:\/ ?(month|mo|tháng))?$/,
	);
	const unit = prefixed?.[1] ?? suffixed?.[2];
	const written = prefixed?.[2] ?? suffixed?.[1];
	const period = prefixed?.[3] ?? suffixed?.[3];
	if (unit === undefined || written === undefined) return null;
	const amount = parseAmount(written);
	if (amount === null) return null;
	const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(amount);
	const key = USD.has(unit) ? "usd" : UNIT_KEY[unit];
	if (!key) return null;
	const value = t(`detailValues.budget.${key}`, { amount: number });
	return period ? t("detailValues.budget.perMonth", { amount: value }) : value;
}

/* ---------------------------------------------------------------- nationality */

/** The extractor's closed list (`extract.ts`), each a key under `detailValues.nationality`. */
const NATIONALITIES = new Set([
	"Japanese",
	"Korean",
	"Russian",
	"American",
	"British",
	"French",
	"German",
	"Chinese",
	"Singaporean",
	"Australian",
	"Canadian",
]);

function formatNationality(raw: string, t: DetailTranslate): string | null {
	return NATIONALITIES.has(raw) ? t(`detailValues.nationality.${raw}`) : null;
}

/* ---------------------------------------------------------------- beds / household */

/** One piece the extractor builds ("3 bed", "family of 4", …), or null for one it doesn't. */
function householdPiece(piece: string, t: DetailTranslate): string | null {
	const text = normalized(piece);
	if (text === "studio") return t("detailValues.household.studio");
	if (text === "couple") return t("detailValues.household.couple");
	const counted: Array<[RegExp, string]> = [
		[/^(\d+) bed$/, "beds"],
		[/^family of (\d+)$/, "family"],
		[/^(\d+) people$/, "people"],
		[/^(\d+) kids$/, "kids"],
	];
	for (const [re, key] of counted) {
		const match = text.match(re);
		if (match?.[1]) {
			const one = match[1] === "1" && (key === "people" || key === "kids") ? "One" : "";
			return t(`detailValues.household.${key}${one}`, { count: match[1] });
		}
	}
	return null;
}

function formatHousehold(raw: string, t: DetailTranslate): string {
	return raw
		.split(",")
		.map((piece) => piece.trim())
		.filter(Boolean)
		.map((piece) => householdPiece(piece, t) ?? piece)
		.join(", ");
}

/* ---------------------------------------------------------------- the one formatter */

/**
 * A stored detail, read in `lang` (the office language, ADR 0025) through `t`, whose messages
 * are in that language. Move-in, budget, nationality and beds / household are put in words; any
 * other field, and any value not recognised, reads as stored.
 */
export function formatGuestDetail(
	id: ExtractFieldId,
	raw: string,
	lang: string,
	t: DetailTranslate,
): string {
	const formatted = (() => {
		switch (id) {
			case "moveIn":
				return formatMoveIn(raw, lang, t);
			case "budget":
				return formatBudget(raw, lang, t);
			case "nationality":
				return formatNationality(raw, t);
			case "beds":
				return formatHousehold(raw, t);
			default:
				return null;
		}
	})();
	return formatted || raw;
}
