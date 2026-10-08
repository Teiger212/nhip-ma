/** Seed logins and office (apps/saas/modules/inbox/lib/demo-user.ts, docs/e2e-scenarios.md "Seed"). */
import {
	DEMO_ADMIN_EMAIL,
	DEMO_AGENT2_EMAIL,
	DEMO_AGENT2_NAME,
	DEMO_MANAGER_EMAIL,
	DEMO_MANAGER_NAME,
	DEMO_OFFICE_ID,
	DEMO_OFFICE_NAME,
	DEMO_OFFICE_SLUG,
	DEMO_AGENT_EMAIL,
	DEMO_AGENT_NAME,
	DEMO_PASSWORD,
} from "../../modules/inbox/lib/demo-user";

export type Login = { email: string; password: string };

/** The agent: a plain member of the walk office. */
export const AGENT: Login = { email: DEMO_AGENT_EMAIL, password: DEMO_PASSWORD };

/** The second agent of the walk office (ADR 0015). */
export const AGENT_2: Login = { email: DEMO_AGENT2_EMAIL, password: DEMO_PASSWORD };

/** The walk office's manager (ADR 0015): sees every thread and reassigns. */
export const MANAGER: Login = { email: DEMO_MANAGER_EMAIL, password: DEMO_PASSWORD };

/** The platform admin: owner of the walk office; the seed gives both logins the same password. */
export const PLATFORM_ADMIN: Login = { email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD };

export {
	DEMO_AGENT2_NAME,
	DEMO_AGENT_NAME,
	DEMO_MANAGER_NAME,
	DEMO_OFFICE_ID,
	DEMO_OFFICE_NAME,
	DEMO_OFFICE_SLUG,
};

/**
 * The address of an office's page: `/<locale>/<office slug>/<path>`; an empty `path` is the
 * office's own address. For an office of a test's own (its slug read back), use `officeUrlOf`.
 */
export function officeUrlOf(slug: string, path: string, locale: "en" | "vi" = "en"): string {
	return `/${locale}/${slug}${path ? `/${path}` : ""}`;
}

/** The demo office's (Hanoi Nest Seekers) page, e.g. `officeUrl("settings/general")`. */
export function officeUrl(path: string, locale: "en" | "vi" = "en"): string {
	return officeUrlOf(DEMO_OFFICE_SLUG, path, locale);
}

/** A password that passes the sign-up form's rules, so a refusal is never about the password. */
export const NEW_PASSWORD = "Str0ng!Passw0rd-e2e";
