/**
 * Where `pnpm seed` may write (#69). Its logins share a public password and its guests are
 * invented, so it never writes to production: not under `VERCEL_ENV=production` (as `config.ts`
 * refuses the mock CRM's secret and the E2E build there), and not to a database that isn't on
 * this machine. A database URL can't tell a Neon production branch from a dev one, so a remote
 * database is seeded only when `SEED_REMOTE_DATABASE_HOST` names its host exactly: a deliberate
 * act for one database (the Neon `dev` branch), never a blanket switch. Production refuses even
 * then.
 */

/** Hosts that are this machine: loopback, or a Unix socket (no host). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/** The environment the seed runs in: `VERCEL_ENV`, `DATABASE_URL`, `SEED_REMOTE_DATABASE_HOST`, `E2E`. */
export type SeedEnv = Record<string, string | undefined>;

/** Why the seed must not run here, or null when it may. Never quotes the URL: it holds a password. */
export function seedRefusal(env: SeedEnv): string | null {
	if (env.VERCEL_ENV === "production") {
		return "VERCEL_ENV is production: the seed never writes to production (its logins share a public password).";
	}
	const url = env.DATABASE_URL?.trim();
	if (!url) return "DATABASE_URL is not set: there is no database to seed.";
	let host: string;
	try {
		host = new URL(url).hostname;
	} catch {
		return "DATABASE_URL is not a database URL.";
	}
	if (LOCAL_HOSTS.has(host)) return null;
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
