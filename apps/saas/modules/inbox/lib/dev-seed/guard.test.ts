import { expect, test } from "vitest";

import { seedRefusal } from "./guard";

/**
 * `pnpm seed` never writes to production (#69): only to a database on this machine, or to the
 * one remote dev database named by host, and never under `VERCEL_ENV=production`.
 */

const NEON = "postgresql://app:secret@ep-quiet-river-0000.aws.neon.tech/neondb";

test("a local database is seeded: loopback, a socket, no host", () => {
	for (const url of [
		"postgresql://postgres:postgres@localhost:5432/supastarter",
		"postgresql://postgres@127.0.0.1/nhip_dev_x",
		"postgresql://postgres@[::1]:5432/db",
		"postgresql:///supastarter",
	]) {
		expect(seedRefusal({ DATABASE_URL: url }), url).toBeNull();
	}
	expect(seedRefusal({ DATABASE_URL: "postgresql:///db", PGHOST: "/tmp" })).toBeNull();
});

test("production is refused, even with a remote database named", () => {
	expect(
		seedRefusal({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://localhost/db" }),
	).toMatch(/production/);
	expect(
		seedRefusal({
			VERCEL_ENV: "production",
			DATABASE_URL: NEON,
			SEED_REMOTE_DATABASE_HOST: "ep-quiet-river-0000.aws.neon.tech",
		}),
	).toMatch(/production/);
});

test("a remote database is refused unless its host is named", () => {
	expect(seedRefusal({ DATABASE_URL: NEON })).toMatch(/not a local database/);
	expect(
		seedRefusal({ DATABASE_URL: NEON, SEED_REMOTE_DATABASE_HOST: "ep-other-0000.aws.neon.tech" }),
	).toMatch(/not a local database/);
	expect(
		seedRefusal({
			DATABASE_URL: NEON,
			SEED_REMOTE_DATABASE_HOST: "ep-quiet-river-0000.aws.neon.tech",
		}),
	).toBeNull();
});

test("the host pg would really connect to is the one checked", () => {
	// pg takes `?host=` over the URL's host, and PGHOST when the URL has none.
	expect(
		seedRefusal({ DATABASE_URL: "postgresql://localhost/db?host=db.example.com" }),
	).not.toBeNull();
	expect(seedRefusal({ DATABASE_URL: "postgresql:///db?hostaddr=203.0.113.7" })).not.toBeNull();
	expect(seedRefusal({ DATABASE_URL: "postgresql:///db", PGHOST: "db.example.com" })).toMatch(
		/not a local database/,
	);
});

test("no database, or no URL, is refused", () => {
	expect(seedRefusal({})).toMatch(/not set/);
	expect(seedRefusal({ DATABASE_URL: "not a url" })).toMatch(/not a database URL/);
});
