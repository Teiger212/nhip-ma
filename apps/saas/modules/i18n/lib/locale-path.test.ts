import { describe, expect, it } from "vitest";

import {
	isInboxPath,
	isSaasLocale,
	localeFromCookieHeader,
	localePrefixedPath,
	resolveSaasLocale,
	withoutLocalePrefix,
} from "./locale-path";

describe("locale path helpers", () => {
	it("resolves known locales and falls back to English", () => {
		expect(isSaasLocale("en")).toBe(true);
		expect(isSaasLocale("vi")).toBe(true);
		expect(isSaasLocale("vn")).toBe(false);
		expect(resolveSaasLocale("vi")).toBe("vi");
		expect(resolveSaasLocale("vn")).toBe("en");
		expect(resolveSaasLocale(undefined)).toBe("en");
	});

	it("strips a valid locale prefix and leaves other paths alone", () => {
		expect(withoutLocalePrefix("/en/inbox")).toBe("/inbox");
		expect(withoutLocalePrefix("/vi/settings/general")).toBe("/settings/general");
		expect(withoutLocalePrefix("/en")).toBe("/");
		expect(withoutLocalePrefix("/inbox")).toBe("/inbox");
		expect(withoutLocalePrefix("/login")).toBe("/login");
	});

	it("detects inbox paths with or without a locale prefix", () => {
		expect(isInboxPath("/inbox")).toBe(true);
		expect(isInboxPath("/en/inbox")).toBe(true);
		expect(isInboxPath("/vi/inbox")).toBe(true);
		expect(isInboxPath("/en/settings")).toBe(false);
		expect(isInboxPath("/login")).toBe(false);
	});

	it("reads NEXT_LOCALE from a cookie header", () => {
		expect(localeFromCookieHeader("NEXT_LOCALE=vi; other=1")).toBe("vi");
		expect(localeFromCookieHeader("other=1; NEXT_LOCALE=de")).toBe("de");
		expect(localeFromCookieHeader("NEXT_LOCALE=vn")).toBe("en");
		expect(localeFromCookieHeader(undefined)).toBe("en");
	});

	it("prefixes paths with the resolved locale", () => {
		expect(localePrefixedPath("/inbox")).toBe("/en/inbox");
		expect(localePrefixedPath("/inbox", "vi")).toBe("/vi/inbox");
		expect(localePrefixedPath("/", "en")).toBe("/en");
		expect(localePrefixedPath("/inbox", "vn")).toBe("/en/inbox");
	});
});
