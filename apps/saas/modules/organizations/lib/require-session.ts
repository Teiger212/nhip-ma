import "server-only";
import { getSession } from "@auth/lib/server";
import { localeRedirect } from "@i18n/routing";
import { getLocale } from "next-intl/server";

/**
 * "Signed in", checked by the page itself (#231). The `(authenticated)` layout checks it too, but
 * a layout's check doesn't run again when you move between its pages, and a crafted RSC request
 * renders a page without its layout (Next's auth guide, "Layouts and auth checks"). So every page
 * under `(authenticated)` that reads data on the server calls this first, before it reads
 * anything, as the office's settings call `requireOfficeManager`. Without a session it sends the
 * visitor to login in their language, as the layout does. `proxy.ts` turns away a request with no
 * session cookie before any page runs, but it only sees the cookie: this is the check.
 */
export async function requireSession() {
	const session = await getSession();

	if (!session) {
		// It throws (its type is `never`); returning it is what tells TypeScript the session is set.
		return localeRedirect({ href: "/login", locale: await getLocale() });
	}

	return session;
}
