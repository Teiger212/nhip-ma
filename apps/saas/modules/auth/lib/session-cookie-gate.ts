import { isWalkLocale } from "@shared/lib/walk-locales";

/**
 * The pages under `/<locale>/` that a signed-out visitor opens: the `(unauthenticated)` group
 * (a test keeps the two in step), and the invitation page. People reach the invitation page
 * signed in, after the email's link took them through login or sign-up. Its own layout and page
 * still send a signed-out visitor to login, so the proxy leaves it alone.
 */
export const PUBLIC_PAGES: ReadonlySet<string> = new Set([
	"login",
	"signup",
	"forgot-password",
	"reset-password",
	"verify",
	"organization-invitation",
]);

/**
 * Where `proxy.ts` sends a request that carries no session cookie (#231), or null to let it
 * through. Only a request for a page (`GET`/`HEAD`) of a locale (`/en/…`, `/vi/…`) outside the
 * public pages goes to that locale's login. Nothing else is ever redirected here, whatever the
 * matcher lets in:
 * - `/api`, `/webhooks`, `/dev`, `/_next` and files;
 * - server actions (`POST`);
 * - a path without its locale, which next-intl gives one first.
 */
export function loginRedirectPath(method: string, pathname: string): string | null {
	if (method !== "GET" && method !== "HEAD") {
		return null;
	}

	const segments = pathname.split("/");
	const [, locale, page] = segments;

	if (!locale || !isWalkLocale(locale)) {
		return null;
	}
	if (page !== undefined && PUBLIC_PAGES.has(page)) {
		return null;
	}
	if (segments.at(-1)?.includes(".")) {
		return null;
	}

	return `/${locale}/login`;
}
