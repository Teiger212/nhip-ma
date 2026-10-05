/** Seed logins and office (apps/saas/modules/inbox/lib/walk-user.ts, docs/e2e-scenarios.md "Seed"). */
import {
	WALK_ADMIN_EMAIL,
	WALK_AGENT2_EMAIL,
	WALK_MANAGER_EMAIL,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
	WALK_USER_PASSWORD,
} from "../../modules/inbox/lib/walk-user";

export type Login = { email: string; password: string };

/** The agent: a plain member of the walk office. */
export const AGENT: Login = { email: WALK_USER_EMAIL, password: WALK_USER_PASSWORD };

/** The second agent of the walk office (ADR 0015). */
export const AGENT_2: Login = { email: WALK_AGENT2_EMAIL, password: WALK_USER_PASSWORD };

/** The walk office's manager (ADR 0015): sees every thread and reassigns. */
export const MANAGER: Login = { email: WALK_MANAGER_EMAIL, password: WALK_USER_PASSWORD };

/** The platform admin: owner of the walk office; the seed gives both logins the same password. */
export const PLATFORM_ADMIN: Login = { email: WALK_ADMIN_EMAIL, password: WALK_USER_PASSWORD };

export { WALK_OFFICE_ID };

/** A password that passes the sign-up form's rules, so a refusal is never about the password. */
export const NEW_PASSWORD = "Str0ng!Passw0rd-e2e";
