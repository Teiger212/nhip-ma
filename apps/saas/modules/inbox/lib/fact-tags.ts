/**
 * The colour of a fact tag (DESIGN.md, Fact Tags; #314). Each value keeps one colour wherever it
 * shows: a language by a fixed map, an area by a stable hash of its name, so "Tây Hồ" is the same
 * green on every row, on every device, on every day. Beds and budget stay plain: they are numbers
 * to read, not places to recognise. Pure and safe for the client.
 */

export type TagTone =
	| "violet"
	| "teal"
	| "rose"
	| "amber"
	| "berry"
	| "lagoon"
	| "sage"
	| "moss"
	| "plain";

/** The coloured tones, in the order an area's hash picks from. */
const HUED: readonly Exclude<TagTone, "plain">[] = [
	"violet",
	"teal",
	"rose",
	"amber",
	"berry",
	"lagoon",
	"sage",
	"moss",
];

/** The guest languages Nhịp meets most, each with its own colour (ISO 639-1). */
const LANGUAGE_TONES: Record<string, TagTone> = {
	ko: "violet",
	en: "teal",
	ja: "rose",
	vi: "amber",
	zh: "berry",
	ru: "lagoon",
	fr: "sage",
	de: "moss",
};

/** A value as its colour is keyed: Unicode-normalised, trimmed, case and spacing folded. */
function key(value: string): string {
	return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** FNV-1a over the key's UTF-16 units: small, stable across runtimes, well spread. */
function hash(value: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < value.length; i += 1) {
		h ^= value.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** A coloured tone for any value, the same one every time. */
function hashedTone(value: string): TagTone {
	return HUED[hash(key(value)) % HUED.length];
}

/** A guest language's tone: its own from the map, or a stable one for any other code. */
export function languageTone(code: string): TagTone {
	return LANGUAGE_TONES[key(code)] ?? hashedTone(code);
}

/** An area's tone, by its name as stored. */
export function areaTone(area: string): TagTone {
	return hashedTone(area);
}
