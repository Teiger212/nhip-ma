import { describe, expect, it } from "vitest";

import { isWalkLocale, resolveWalkLocale, walkLocaleOptions, walkLocales } from "./walk-locales";

describe("walk locales", () => {
	it("exposes only English and Vietnamese for walk chrome", () => {
		expect(walkLocales).toEqual(["en", "vi"]);
		expect(walkLocaleOptions.map((locale) => locale.value)).toEqual(["en", "vi"]);
		expect(walkLocaleOptions.map((locale) => locale.label)).toEqual(["English", "Tiếng Việt"]);
		expect(walkLocaleOptions.map((locale) => locale.code)).toEqual(["EN", "VI"]);
	});

	it("accepts walk codes and rejects kit extras", () => {
		expect(isWalkLocale("en")).toBe(true);
		expect(isWalkLocale("vi")).toBe(true);
		expect(isWalkLocale("de")).toBe(false);
		expect(isWalkLocale("es")).toBe(false);
		expect(isWalkLocale("fr")).toBe(false);
		expect(isWalkLocale("vn")).toBe(false);
	});

	it("falls back to English for unknown operator locales", () => {
		expect(resolveWalkLocale("en")).toBe("en");
		expect(resolveWalkLocale("vi")).toBe("vi");
		expect(resolveWalkLocale("de")).toBe("en");
		expect(resolveWalkLocale("vn")).toBe("en");
	});
});
