import type { GuestLanguage, OneShot } from "./types";

/**
 * Naming a guest language for people (#245). Safe for the client: no detection here, and
 * nothing from `@repo/database` at runtime.
 */

/**
 * The five Nhịp has copy and translation for, as `GuestLanguage` declares them. Whether it replies
 * in one is the deployment's gate, `SUPPORTED_GUEST_LANGUAGES` (#306): a guest in one of the five
 * the gate leaves out is still translated for the agent, and answered in English.
 */
const SUPPORTED: readonly string[] = [
	"en",
	"vi",
	"ja",
	"ko",
	"ru",
] satisfies readonly GuestLanguage[];

/** One of the five Nhịp has copy and translation for, whatever the gate says. */
export function isSupportedLanguage(code: string): code is GuestLanguage {
	return SUPPORTED.includes(code);
}

/**
 * The guest languages Nhịp replies in when `SUPPORTED_GUEST_LANGUAGES` is unset (#306): English and
 * Vietnamese, until after the demo. English is always among them: it is every other guest's reply.
 */
export const DEFAULT_SUPPORTED_GUEST_LANGUAGES: readonly GuestLanguage[] = ["en", "vi"];

/**
 * The language Nhịp writes to the guest in (ADR 0021 R4, #245, #306): the guest language when the
 * gate lets it through, otherwise English.
 */
export function replyLanguageFor(
	guestLanguage: string,
	supported: readonly GuestLanguage[],
): GuestLanguage {
	return isSupportedLanguage(guestLanguage) && supported.includes(guestLanguage)
		? guestLanguage
		: "en";
}

/**
 * Whether the thread is answered in English although the guest writes another language: one Nhịp
 * doesn't know (#245), or one of the five the gate leaves out (#306). Read from the stored one-shot,
 * never from the gate, so it is safe on the client.
 */
export function repliesInEnglishInstead(
	shot: Pick<OneShot, "language" | "guestLanguage">,
): boolean {
	return namedLanguage(shot) !== shot.language;
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
