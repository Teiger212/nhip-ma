import { eld } from "eld/extrasmall";

import { AREAS } from "./areas";
import type { GuestLanguage } from "./types";

/**
 * The language Nhịp writes to the guest in: one of the five it supports (CONTEXT.md "Guest
 * language"), read from scripts and Vietnamese-only letters and words. Anything else, and
 * anything unsure, is English (ADR 0021 R4). `identifyLanguage` names the language itself.
 */
export function detectLanguage(text: string): GuestLanguage {
	// Composed (NFC), so a tone or horn sent as its own combining mark is the same letter.
	const sample = String(text || "").normalize("NFC");
	if (/[\uac00-\ud7af]/.test(sample)) {
		return "ko";
	}
	if (/[\u3040-\u30ff]/.test(sample)) {
		return "ja";
	}
	if (/[\u0400-\u04ff]/.test(sample)) {
		return "ru";
	}
	// Only letters Vietnamese alone uses (ADR 0021): ă â đ ơ ư; a hook above or a dot below;
	// ẽ ĩ ũ ỹ; any tone on ă â ê ô ơ ư. French, Spanish and Portuguese accents are left out.
	if (/[ăâđơưảẻỉỏủỷạẹịọụỵẽĩũỹằắẳẵặầấẩẫậềếểễệồốổỗộờớởỡợừứửữự]/i.test(sample)) {
		return "vi";
	}
	// Whole words by any letter, not \b's ASCII: "thuê" and "nhà" end in a non-ASCII letter.
	if (
		/(?<!\p{L})(tôi|mình|muốn|thuê|mua|căn|hộ|phòng|ngủ|nhà|giá|quận|anh|chị)(?!\p{L})/iu.test(
			sample,
		)
	) {
		return "vi";
	}
	return "en";
}

/**
 * Scripts that name one language, beyond the five's (#245). Han with no kana is Chinese: kana
 * is Japanese, caught by `detectLanguage` first.
 */
const SCRIPTS: Array<[RegExp, string]> = [
	[/\p{Script=Han}/u, "zh"],
	[/\p{Script=Thai}/u, "th"],
	[/\p{Script=Lao}/u, "lo"],
	[/\p{Script=Khmer}/u, "km"],
	[/\p{Script=Arabic}/u, "ar"],
	[/\p{Script=Hebrew}/u, "he"],
	[/\p{Script=Devanagari}/u, "hi"],
	[/\p{Script=Greek}/u, "el"],
];

/**
 * The Latin-script languages the library may name. Kept short on purpose: every language added
 * is one more way to misread a short English message, and most guests write English. English is
 * in it, so English text is read as English rather than as its nearest neighbour.
 */
const LATIN_LANGUAGES = ["en", "fr", "es", "pt", "de", "it", "nl"];

// eld (Nito-ELD), its smallest n-gram set, restricted to the languages above. Server only:
// nothing on the client imports this module.
eld.setLanguageSubset(LATIN_LANGUAGES);

/** Fewer letters than this, once place names are out, and a line doesn't vote. */
const MIN_LETTERS = 20;

/** Place names guests write that the areas list lacks. A place name is no language. */
const PLACES =
	/(?<!\p{L})(?:lotte|my\s*dinh|thanh\s*xuan|hoang\s*mai|ha\s*dong|tu\s*liem|keangnam|royal\s*city|vincom|saigon|ho\s*chi\s*minh|da\s*nang)(?!\p{L})/giu;
const AREA_NAMES = AREAS.map(({ re }) => new RegExp(re.source, "giu"));

/**
 * Vietnamese typed without diacritics, common on Zalo: the library has no Vietnamese and would
 * name it something else. A line with two of these words doesn't vote, so it stays unsure
 * (English), as before.
 */
const UNACCENTED_VI =
	/(?<!\p{L})(?:oi|khong|minh|anh|chi|thue|nha|hoi|gia|bao|nhieu|nay|phong|ngu|muon|toi|ban|duoc|xin|chao|cam|nhe|vang)(?!\p{L})/giu;

/**
 * Single words the library can't read ("Bonjour", "Hola"), checked only once no line has a
 * reliable reading. A greeting here names its language; an English guest who writes "Merci"
 * once in a longer English thread is still read as English, by the vote below.
 */
const GREETINGS: Record<string, string[]> = {
	fr: ["bonjour", "bonsoir", "salut", "merci"],
	es: ["hola", "gracias", "buenos", "buenas"],
	pt: ["olá", "obrigado", "obrigada"],
	de: ["hallo", "danke", "servus"],
	it: ["ciao", "grazie", "buongiorno", "buonasera"],
	nl: ["hoi", "bedankt", "goedemorgen", "goedemiddag"],
};

/** One line's reading, or null when it has too little to go on. */
function readLine(line: string): string | null {
	let text = line;
	for (const re of AREA_NAMES) text = text.replace(re, " ");
	text = text.replace(PLACES, " ");
	if ((text.match(UNACCENTED_VI)?.length ?? 0) >= 2) return null;
	const letters = text.match(/\p{L}/gu)?.length ?? 0;
	if (letters < MIN_LETTERS) return null;
	const reading = eld.detect(text);
	return reading.language && reading.isReliable() ? reading.language : null;
}

/**
 * The language the guest writes in, any language, as an ISO 639-1 code (#245; CONTEXT.md
 * "Guest language"). No model call.
 *
 * 1. The five Nhịp supports, as `detectLanguage` reads them (unchanged, the fast path).
 * 2. A script that names one language: Chinese, Thai, Arabic and the like.
 * 3. Latin text: each line is read by the library, without place names, and only a reliable
 *    reading of enough letters counts; the language most of the letters are in wins. A thread
 *    is all its guest messages, so a French guest who later writes a mostly English line stays
 *    French.
 * 4. A greeting the library can't read alone.
 * 5. English, as before: when unsure, English.
 */
export function identifyLanguage(text: string): string {
	const sample = String(text || "").normalize("NFC");
	const supported = detectLanguage(sample);
	if (supported !== "en") {
		return supported;
	}
	for (const [script, language] of SCRIPTS) {
		if (script.test(sample)) return language;
	}
	const votes = new Map<string, number>();
	for (const line of sample.split("\n")) {
		const language = readLine(line);
		if (!language) continue;
		const letters = line.match(/\p{L}/gu)?.length ?? 0;
		votes.set(language, (votes.get(language) ?? 0) + letters);
	}
	let best: string | null = null;
	for (const [language, letters] of votes) {
		if (best === null || letters > (votes.get(best) ?? 0)) best = language;
	}
	if (best) {
		return best;
	}
	// Not on unaccented Vietnamese: "hoi" (ask) is Dutch's "hoi" (hi).
	if ((sample.match(UNACCENTED_VI)?.length ?? 0) >= 2) {
		return "en";
	}
	const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
	for (const [language, greetings] of Object.entries(GREETINGS)) {
		if (words.some((word) => greetings.includes(word))) return language;
	}
	return "en";
}
