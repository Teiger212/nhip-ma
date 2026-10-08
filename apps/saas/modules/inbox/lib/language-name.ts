import type { GuestLanguage, OneShot } from "./types";

/**
 * Naming a guest language for people (#245). Safe for the client: no detection here, and
 * nothing from `@repo/database` at runtime.
 */

/** The five Nhịp supports (CONTEXT.md "Guest language"), as `GuestLanguage` declares them. */
const SUPPORTED: readonly string[] = [
	"en",
	"vi",
	"ja",
	"ko",
	"ru",
] satisfies readonly GuestLanguage[];

export function isSupportedLanguage(code: string): code is GuestLanguage {
	return SUPPORTED.includes(code);
}

/** The guest language a one-shot names: the detected one, or, from before #245, the reply's. */
export function namedLanguage(shot: Pick<OneShot, "language" | "guestLanguage">): string {
	return shot.guestLanguage ?? shot.language;
}

/**
 * A language's name in the interface language. The five keep their own copy (`supported`,
 * the `guestLanguage.*` strings); any other comes from the platform's names, lowercased in
 * Vietnamese as the five's VI copy is ("tiếng Pháp").
 */
export function languageName(
	code: string,
	locale: string,
	supported: (language: GuestLanguage) => string,
): string {
	if (isSupportedLanguage(code)) {
		return supported(code);
	}
	let name: string | undefined;
	try {
		name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
	} catch {
		name = undefined;
	}
	if (!name || name === code) {
		return code.toUpperCase();
	}
	return locale === "vi" ? name.charAt(0).toLocaleLowerCase("vi") + name.slice(1) : name;
}
