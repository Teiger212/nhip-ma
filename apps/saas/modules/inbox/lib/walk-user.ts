/** The agent: a member of the walk office, sees Inbox and Home. */
export const WALK_USER_EMAIL = "walk@nhip.local";
export const WALK_USER_NAME = "Walk Operator";
export const WALK_USER_PASSWORD = "walkthrough";

/** The second agent (ADR 0015): shows that one agent never sees another's threads. */
export const WALK_AGENT2_EMAIL = "walk2@nhip.local";
export const WALK_AGENT2_NAME = "Walk Operator Two";

/** The walk office's manager (ADR 0015): kit role `admin`; sees every thread and reassigns. */
export const WALK_MANAGER_EMAIL = "manager@nhip.local";
export const WALK_MANAGER_NAME = "Walk Manager";

/** The platform admin (Nhịp): owner of the walk office, also sees the kit's admin area. */
export const WALK_ADMIN_EMAIL = "admin@nhip.local";
export const WALK_ADMIN_NAME = "Walk Admin";

/**
 * The walk office (ADR 0008): the kit organization the walk operator belongs to and the
 * invented threads are filed under. Its id is fixed so seeding is idempotent.
 */
export const WALK_OFFICE_ID = "walk-office";
export const WALK_OFFICE_NAME = "Walk Office";
export const WALK_OFFICE_SLUG = "walk";
