import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { Api } from "./session";
import { withOrigin } from "./session";

export type Office = { id: string; name: string };

/** Asks to create an office; the answer is the caller's to judge (only the platform admin may). */
export function tryCreateOffice(api: Api, name: string) {
	return api.post("/api/auth/organization/create", {
		name,
		slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
	});
}

export function deleteOffice(api: Api, organizationId: string) {
	return api.post("/api/auth/organization/delete", { organizationId });
}

/** The offices the account signed in on this page belongs to (the kit's organization list). */
export async function officesOf(page: Page): Promise<Office[]> {
	const res = await page.request.get("/api/auth/organization/list");
	expect(res.ok()).toBe(true);
	return (await res.json()) as Office[];
}

/** The account signed in on this page accepts an invitation, as its browser would. */
export function acceptInvitation(page: Page, invitationId: string) {
	return withOrigin(page.request).post("/api/auth/organization/accept-invitation", {
		invitationId,
	});
}
