import { localePrefixedPath } from "@i18n/lib/locale-path";

export const WALK_USER_EMAIL = "walk@nhip.local";
export const WALK_USER_NAME = "Walk Operator";
export const WALK_USER_PASSWORD = "walkthrough";

const DEFAULT_WALK_SAAS_URL = "http://localhost:3010";

export function isWalkBypassAuthEnabled(
	value = process.env.WALK_BYPASS_AUTH,
	nodeEnv = process.env.NODE_ENV,
): boolean {
	return value === "1" && nodeEnv !== "production";
}

export function walkInboxRedirectUrl(
	saasUrl = process.env.NEXT_PUBLIC_SAAS_URL,
	locale?: string | null,
): URL {
	return new URL(localePrefixedPath("/inbox", locale), saasUrl || DEFAULT_WALK_SAAS_URL);
}

export function isPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
	return Boolean(databaseUrl && /^(postgres(ql)?:)/i.test(databaseUrl));
}

export function canUseKitAuthDatabase(databaseUrl = process.env.DATABASE_URL): boolean {
	return isPostgresDatabaseUrl(databaseUrl);
}
