/**
 * Where `pnpm seed` may write (#69). Its logins share a public password and its guests are
 * invented, so it never writes to production: not under `VERCEL_ENV=production` (as `config.ts`
 * refuses the mock CRM's secret and the E2E build there), and not to a database that isn't on
 * this machine. A database URL can't tell a Neon production branch from a dev one, so a remote
 * database is seeded only when `SEED_REMOTE_DATABASE_HOST` names its host exactly: a deliberate
 * act for one database (the Neon `dev` branch), never a blanket switch. Production refuses even
 * then.
 */

/** Hosts that are this machine: loopback. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** The environment the seed runs in: `VERCEL_ENV`, `DATABASE_URL`, `SEED_REMOTE_DATABASE_HOST`, `PGHOST`, `E2E`. */
export type SeedEnv = Record<string, string | undefined>;

/** Loopback, or a Unix socket's directory: this machine. */
function isLocal(host: string): boolean {
	return LOOPBACK.has(host) || host.startsWith("/");
}

/** Why the seed must not run here, or null when it may. Never quotes the URL: it holds a password. */
export function seedRefusal(env: SeedEnv): string | null {
	if (env.VERCEL_ENV === "production") {
		return "VERCEL_ENV is production: the seed never writes to production (its logins share a public password).";
	}
	const url = env.DATABASE_URL?.trim();
	if (!url) return "DATABASE_URL is not set: there is no database to seed.";
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return "DATABASE_URL is not a database URL.";
	}
	// pg takes the host from `?host=` or `?hostaddr=` over the URL's own, and from PGHOST when
	// the URL names none: the host checked is the one pg connects to.
	if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
		return "DATABASE_URL names its host in a query parameter: the seed reads only the URL's own host.";
	}
	const host = parsed.hostname || env.PGHOST?.trim() || "localhost";
	if (isLocal(host)) return null;
	if (env.SEED_REMOTE_DATABASE_HOST?.trim() === host) return null;
	return "DATABASE_URL is not a local database. To seed a remote dev database (never staging or production), set SEED_REMOTE_DATABASE_HOST to its host.";
}

/** The seed refused to run (`seedRefusal`); nothing was written. */
export class SeedRefused extends Error {
	constructor(reason: string) {
		super(`Seed refused: ${reason}`);
		this.name = "SeedRefused";
	}
}
