export const WALK_USER_EMAIL = "walk@nhip.local";
export const WALK_USER_NAME = "Walk Operator";
export const WALK_USER_PASSWORD = "walkthrough";

/**
 * The walk office (ADR 0008): the kit organization the walk operator belongs to and the
 * invented threads are filed under. Its id is fixed so the SQLite inbox and the Postgres
 * organization agree without a lookup, and so seeding is idempotent.
 */
export const WALK_OFFICE_ID = "walk-office";
export const WALK_OFFICE_NAME = "Walk Office";
export const WALK_OFFICE_SLUG = "walk";

export function isPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
	return Boolean(databaseUrl && /^(postgres(ql)?:)/i.test(databaseUrl));
}

export function canUseKitAuthDatabase(databaseUrl = process.env.DATABASE_URL): boolean {
	return isPostgresDatabaseUrl(databaseUrl);
}
