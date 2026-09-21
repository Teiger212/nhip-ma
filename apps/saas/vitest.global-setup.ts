import { execFileSync } from "node:child_process";
import path from "node:path";

import { ensureTestDatabase, testDatabaseUrl } from "@repo/database/inbox/testing";

/**
 * Store tests need the inbox tables in the test database. Push the schema there once per
 * run; each test then truncates what it needs (`resetInboxTables`). The push is the plain
 * one: a schema change that would lose data on the test database is not accepted
 * silently; drop the test database (`dropdb supastarter_test`) and run again.
 */
export default async function setup(): Promise<void> {
	const url = testDatabaseUrl();
	await ensureTestDatabase(url);
	execFileSync("pnpm", ["exec", "prisma", "db", "push"], {
		cwd: path.resolve(import.meta.dirname, "../../packages/database"),
		// prisma.config.ts reads DATABASE_URL; for this process it is the test database.
		env: { ...process.env, DATABASE_URL: url },
		stdio: "inherit",
	});
}
