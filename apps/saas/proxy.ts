import { loginRedirectPath } from "@auth/lib/session-cookie-gate";
import { routing } from "@i18n/routing";
import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default function proxy(req: NextRequest) {
	// A quick first layer (#231): a signed-in page asked for with no session cookie at all goes
	// to its locale's login before anything renders. It reads the cookie, never the database, so a
	// stale or made-up cookie passes: the check is each page's own `requireSession()`.
	const login = loginRedirectPath(req.method, req.nextUrl.pathname);
	if (login && !getSessionCookie(req)) {
		return NextResponse.redirect(new URL(login, req.url));
	}

	return intlMiddleware(req);
}

export const config = {
	// Next statically parses this literal at build time (see
	// `extractExportedConstValue` in
	// next/dist/build/analysis/extract-const-value.js) and only understands
	// literal expressions written directly in this file, so it cannot be
	// imported from a shared constant.
	// keep in sync with modules/i18n/lib/proxy-matcher.ts (PROXY_MATCHER_SOURCE)
	matcher: [
		"/((?!api(?:/|$)|webhooks(?:/|$)|dev(?:/|$)|image-proxy(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|.*\\..*).*)",
	],
};
