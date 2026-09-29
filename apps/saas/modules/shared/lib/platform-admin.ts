import "server-only";
import { getSession } from "@auth/lib/server";
import { localeRedirect } from "@i18n/routing";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { getLocale } from "next-intl/server";

/** Where the platform admin lands (CONTEXT.md, "Admin area"). */
export const ADMIN_AREA_HREF = "/admin/organizations";

/**
 * Office screens (Inbox, Home, the office's own pages) are for operators. The platform
 * admin is sent to the admin area instead, whatever membership the kit gave them (ADR 0015).
 */
export async function sendPlatformAdminToAdminArea(): Promise<void> {
	const session = await getSession();
	if (session && isPlatformAdmin(session.user.role)) {
		localeRedirect({ href: ADMIN_AREA_HREF, locale: await getLocale() });
	}
}
