import { localeRedirect } from "@i18n/routing";
import { getLocale } from "next-intl/server";

/**
 * An office has no page of its own: its people work in the Inbox and read Home. The kit's
 * start page (invented stats) is gone; accepting an invitation or creating an office lands
 * here, so send them on. The office's settings stay under /{slug}/settings.
 */
export default async function OrganizationPage() {
	const locale = await getLocale();
	localeRedirect({ href: "/inbox", locale });
	return null;
}
