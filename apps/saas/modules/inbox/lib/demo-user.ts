/** The first agent: a member of the walk office (Hanoi Nest Seekers), sees Inbox and Home. */
export const DEMO_AGENT_EMAIL = "linh@nhip.local";
export const DEMO_AGENT_NAME = "Trần Thị Linh";
export const DEMO_PASSWORD = "walkthrough";

/** The second agent (ADR 0015): shows that one agent never sees another's threads. */
export const DEMO_AGENT2_EMAIL = "duc@nhip.local";
export const DEMO_AGENT2_NAME = "Phạm Minh Đức";

/** The walk office's manager (ADR 0015): kit role `admin`; sees every thread and reassigns. */
export const DEMO_MANAGER_EMAIL = "ha@nhip.local";
export const DEMO_MANAGER_NAME = "Lê Thu Hà";

/** The platform admin (Nhịp): owner of the walk office, also sees the kit's admin area. */
export const DEMO_ADMIN_EMAIL = "admin@nhip.local";
export const DEMO_ADMIN_NAME = "Walk Admin";

/**
 * Logins the walk office had before #264, each renamed in place to its successor (same user id,
 * so sessions, memberships and thread ownership carry over): `walk@` is now Linh, `walk2@` Đức,
 * `manager@` Hà. The seed does this on every run, so no old login survives it.
 */
export const LEGACY_DEMO_LOGINS: ReadonlyArray<{ from: string; to: string; name: string }> = [
	{ from: "walk@nhip.local", to: DEMO_AGENT_EMAIL, name: DEMO_AGENT_NAME },
	{ from: "walk2@nhip.local", to: DEMO_AGENT2_EMAIL, name: DEMO_AGENT2_NAME },
	{ from: "manager@nhip.local", to: DEMO_MANAGER_EMAIL, name: DEMO_MANAGER_NAME },
];

/**
 * The walk office (ADR 0008): the kit organization the walk operator belongs to and the
 * invented threads are filed under. Its id is fixed so seeding is idempotent.
 */
export const DEMO_OFFICE_ID = "walk-office";
export const DEMO_OFFICE_NAME = "Hanoi Nest Seekers";
export const DEMO_OFFICE_SLUG = "hanoi-nest-seekers";

/**
 * A second office (#69), seeded for local dev and the demo only (never in E2E): its own manager
 * and two agents, members of it alone (a member of two offices opens nothing, ADR 0010), with
 * the auto-reply off and no CRM. It shows tenancy: nothing crosses offices.
 */
export const RIVER_OFFICE_ID = "river-office";
export const RIVER_OFFICE_NAME = "River Office";
export const RIVER_OFFICE_SLUG = "river";
export const RIVER_MANAGER_EMAIL = "river-manager@nhip.local";
export const RIVER_MANAGER_NAME = "River Manager";
export const RIVER_AGENT_EMAIL = "river-agent@nhip.local";
export const RIVER_AGENT_NAME = "River Agent";
export const RIVER_AGENT2_EMAIL = "river-agent2@nhip.local";
export const RIVER_AGENT2_NAME = "River Agent Two";
