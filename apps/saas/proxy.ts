import { routing } from "@i18n/routing";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default function proxy(req: NextRequest) {
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
