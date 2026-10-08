/**
 * An operator's "name guests see" (docs/e2e-scenarios.md "Name guests see", #266): the name the
 * template suggested reply introduces them by, set on their own account page or through
 * `GET`/`PUT /api/account/name-guests-see`, body `{ "nameGuestsSee": "Lan" }`. An empty or blank
 * value clears it; it answers `{ "nameGuestsSee": "Lan" }`, null when cleared.
 */
import { expect } from "@playwright/test";
import type { APIRequestContext, APIResponse } from "@playwright/test";

import { appOrigin } from "./session";

export const NAME_GUESTS_SEE_ROUTE = "/api/account/name-guests-see";

/** What the route answers. */
export type NameGuestsSee = { nameGuestsSee: string | null };

/**
 * `PUT` as the person `api` is signed in as (their page's `request`, or an anonymous context):
 * the raw answer, for a spec that judges a refusal. A redirect is never followed, so a sign-in
 * page can't pass for an answer.
 */
export function putNameGuestsSee(api: APIRequestContext, value: string): Promise<APIResponse> {
	return api.put(NAME_GUESTS_SEE_ROUTE, {
		data: { nameGuestsSee: value },
		headers: { origin: appOrigin() },
		maxRedirects: 0,
	});
}

/** `GET` as the person `api` is signed in as: the raw answer. */
export function getNameGuestsSee(api: APIRequestContext): Promise<APIResponse> {
	return api.get(NAME_GUESTS_SEE_ROUTE, { maxRedirects: 0 });
}

/**
 * The operator sets their own name guests see (setup, or "from another tab"); fails the test
 * unless it is taken and answered back. A blank `value` clears it.
 */
export async function setNameGuestsSee(api: APIRequestContext, value: string) {
	const res = await putNameGuestsSee(api, value);
	expect(
		res.status(),
		`PUT ${NAME_GUESTS_SEE_ROUTE} sets the name guests see to "${value}": ${await res.text()}`,
	).toBe(200);
	const cleared = value.trim() === "";
	expect(
		(await res.json()) as NameGuestsSee,
		cleared ? "it answers the field cleared" : "it answers the name back",
	).toEqual({ nameGuestsSee: cleared ? null : value });
}
