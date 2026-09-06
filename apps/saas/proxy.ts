import { routing } from "@i18n/routing";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default function proxy(req: NextRequest) {
	return intlMiddleware(req);
}

export const config = {
	matcher: ["/((?!api|webhooks|dev|image-proxy|_next|_vercel|.*\\..*).*)"],
};
