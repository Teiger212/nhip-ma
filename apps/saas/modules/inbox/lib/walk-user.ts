export const WALK_USER_EMAIL = "walk@nhip.local";
export const WALK_USER_NAME = "Walk Operator";
export const WALK_USER_PASSWORD = "walkthrough";

export function isWalkBypassAuthEnabled(value = process.env.WALK_BYPASS_AUTH): boolean {
	return value === "1";
}

export function isPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
	return Boolean(databaseUrl && /^(postgres(ql)?:)/i.test(databaseUrl));
}

export function canUseKitAuthDatabase(databaseUrl = process.env.DATABASE_URL): boolean {
	return isPostgresDatabaseUrl(databaseUrl);
}
