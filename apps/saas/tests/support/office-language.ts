/**
 * The office language (ADR 0025, docs/e2e-scenarios.md "Office language"): one language, English
 * or Vietnamese, for every member of an office. A spec that reads Nhịp in Vietnamese as an office
 * member does it in an office of its own set to Vietnamese; never the walk office, whose language
 * would reach every other spec.
 */
import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

import type { Api } from "./session";
import { appOrigin } from "./session";

export type OfficeLanguage = "en" | "vi";

/**
 * The office's manager sets its language through the API behind the General tab's setting (setup:
 * Office language 1 proves the setting). `manager` is the manager's own request context (their
 * page's `request`), signed in as them; the office is the one their session names.
 */
export async function setOfficeLanguage(manager: APIRequestContext, language: OfficeLanguage) {
	const res = await manager.put("/api/office/language", {
		data: { language },
		headers: { origin: appOrigin() },
		maxRedirects: 0,
	});
	expect(
		res.status(),
		`the manager sets the office language to "${language}": ${await res.text()}`,
	).toBe(200);
}

/** The office's address slug (its settings live at `/<locale>/<slug>/settings/…`), as the platform admin reads it. */
export async function officeSlug(admin: Api, officeId: string): Promise<string> {
	const res = await admin.get("/api/auth/organization/get-full-organization", {
		organizationId: officeId,
	});
	expect(res.ok(), "the platform admin reads the office").toBe(true);
	return ((await res.json()) as { slug: string }).slug;
}
