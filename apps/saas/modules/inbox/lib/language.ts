import { eld } from "eld/extrasmall";

import type { GuestLanguage } from "./types";

/**
 * The language Nhịp writes to the guest in: one of the five it supports (CONTEXT.md "Guest
 * language"), read from scripts and Vietnamese-only letters and words. Anything else, and
 * anything unsure, is English (ADR 0021 R4). `identifyLanguage` names the language itself.
 */
export function detectLanguage(text: string): GuestLanguage {
	// Composed (NFC), so a tone or horn sent as its own combining mark is the same letter.
	const sample = String(text || "").normalize("NFC");
	if (/[가-힯]/.test(sample)) {
		return "ko";
	}
	if (/[぀-ヿ]/.test(sample)) {
		return "ja";
	}
	if (/[Ѐ-ӿ]/.test(sample)) {
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
 * The Latin-script languages the library may name (#245). Kept short on purpose: every
 * language added is one more way to misread a short English message, and most guests write
 * English. English is in it, so English text is read as English rather than as its nearest
 * neighbour.
 */
const LATIN_LANGUAGES = ["en", "fr", "es", "pt", "de", "it", "nl"];

// eld (Nito-ELD), its smallest n-gram set, restricted to the languages above. Server only:
// nothing on the client imports this module.
const latin = eld.newInstance();
latin.setLanguageSubset(LATIN_LANGUAGES);

/**
 * Single words the library can't read ("Bonjour", "Hola"), checked only once it has found no
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

/**
 * The language the guest writes in, any language, as an ISO 639-1 code (#245; CONTEXT.md
 * "Guest language"). No model call.
 *
 * 1. The five Nhịp supports, as `detectLanguage` reads them (unchanged, the fast path).
 * 2. Chinese from Han characters with no kana (kana is Japanese, caught above); Thai from its
 *    script.
 * 3. Latin text: each line is read by the library, and only a reliable reading counts; the
 *    language most of the letters are in wins. A thread is all its guest messages, one per
 *    line or more, so a French guest who later writes a mostly English line stays French.
 * 4. A greeting the library can't read alone.
 * 5. English, as before: when unsure, English.
 */
export function identifyLanguage(text: string): string {
	const sample = String(text || "").normalize("NFC");
	const supported = detectLanguage(sample);
	if (supported !== "en") {
		return supported;
	}
	if (/\p{Script=Han}/u.test(sample)) {
		return "zh";
	}
	if (/\p{Script=Thai}/u.test(sample)) {
		return "th";
	}
	const votes = new Map<string, number>();
	for (const line of sample.split("\n")) {
		const reading = latin.detect(line);
		if (!reading.language || !reading.isReliable()) continue;
		const letters = line.match(/\p{L}/gu)?.length ?? 0;
		votes.set(reading.language, (votes.get(reading.language) ?? 0) + letters);
	}
	let best: string | null = null;
	for (const [language, letters] of votes) {
		if (best === null || letters > (votes.get(best) ?? 0)) best = language;
	}
	if (best) {
		return best;
	}
	const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
	for (const [language, greetings] of Object.entries(GREETINGS)) {
		if (words.some((word) => greetings.includes(word))) return language;
	}
	return "en";
}
