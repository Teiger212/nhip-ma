import { config as i18nConfig, type Locale } from "@repo/i18n";

export const walkLocales = ["en", "vi"] as const satisfies readonly Locale[];

export type WalkLocale = (typeof walkLocales)[number];

export function isWalkLocale(value: string): value is WalkLocale {
	return (walkLocales as readonly string[]).includes(value);
}

export const walkLocaleOptions = walkLocales.map((value) => ({
	value,
	label: i18nConfig.locales[value].label,
}));
