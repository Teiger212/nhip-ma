import { resolveOffice } from "@inbox/lib/office";
import { getRuntime } from "@inbox/lib/runtime";
import type { OperatorLanguage } from "@inbox/lib/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { localePrefixedPath, withoutLocalePrefix } from "./locale-path";
import { REQUEST_PATH_HEADER } from "./request-path";

/**
 * The language a signed-in person reads Nhịp in, when it isn't theirs to choose (ADR 0025): an
 * office member's is the office language. Null for the platform admin, who keeps their own, and
 * for anyone the inbox refuses (no office, two offices).
 */
export async function officeLanguageFor(user: {
	id: string;
	role?: string | null;
}): Promise<OperatorLanguage | null> {
	const office = await resolveOffice(user);
	if (office.denied) return null;
	return getRuntime().store.officeLanguage(office.officeId);
}

/**
 * An office member on the other language's path goes to the same page, query included, in the
 * office language (`/en/inbox?thread=…` to `/vi/inbox?thread=…`). It runs in the authenticated
 * layout, on the server, because the proxy reads no database.
 */
export async function followOfficeLanguage(
	language: OperatorLanguage,
	locale: string,
): Promise<void> {
	if (language === locale) return;
	const requested = (await headers()).get(REQUEST_PATH_HEADER) ?? "/";
	const queryAt = requested.indexOf("?");
	const pathname = queryAt === -1 ? requested : requested.slice(0, queryAt);
	const query = queryAt === -1 ? "" : requested.slice(queryAt);
	redirect(`${localePrefixedPath(withoutLocalePrefix(pathname), language)}${query}`);
}
