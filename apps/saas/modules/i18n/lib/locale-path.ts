import { config as i18nConfig, type Locale } from "@repo/i18n";

const localeSet = new Set<string>(Object.keys(i18nConfig.locales));

export function isSaasLocale(value: string | null | undefined): value is Locale {
	return Boolean(value && value in i18nConfig.locales);
}

export function resolveSaasLocale(value?: string | null): Locale {
	return isSaasLocale(value) ? value : i18nConfig.defaultLocale;
}

export function withoutLocalePrefix(pathname: string): string {
	const match = pathname.match(/^\/([^/]+)(\/.*)?$/);
	if (!match) {
		return pathname;
	}

	const maybeLocale = match[1];
	const rest = match[2];
	if (!maybeLocale || !localeSet.has(maybeLocale)) {
		return pathname;
	}

	return rest && rest.length > 0 ? rest : "/";
}

export function isInboxPath(pathname: string): boolean {
	const path = withoutLocalePrefix(pathname);
	return path === "/inbox" || path.startsWith("/inbox/");
}

export function isHomePath(pathname: string): boolean {
	const path = withoutLocalePrefix(pathname);
	return path === "/home" || path.startsWith("/home/");
}

export function isAdminPath(pathname: string): boolean {
	const path = withoutLocalePrefix(pathname);
	return path === "/admin" || path.startsWith("/admin/");
}

export function localeFromCookieHeader(cookieHeader?: string | null): Locale {
	if (!cookieHeader) {
		return i18nConfig.defaultLocale;
	}

	for (const part of cookieHeader.split(";")) {
		const separator = part.indexOf("=");
		if (separator === -1) {
			continue;
		}

		const name = part.slice(0, separator).trim();
		if (name !== i18nConfig.localeCookieName) {
			continue;
		}

		try {
			return resolveSaasLocale(decodeURIComponent(part.slice(separator + 1).trim()));
		} catch (error) {
			if (error instanceof URIError) {
				return i18nConfig.defaultLocale;
			}
			throw error;
		}
	}

	return i18nConfig.defaultLocale;
}

export function localePrefixedPath(pathname: string, locale?: string | null): string {
	const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `/${resolveSaasLocale(locale)}${normalized === "/" ? "" : normalized}`;
}
