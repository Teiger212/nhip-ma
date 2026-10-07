import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../prisma/generated/client";

/**
 * Test support for the inbox store. Tests run against their own database, never the one
 * in `DATABASE_URL`: `TEST_DATABASE_URL` when set, else the `DATABASE_URL` database with
 * `_test` appended to its name.
 */
type EnvLike = Record<string, string | undefined>;

export function testDatabaseUrl(env: EnvLike = process.env as EnvLike): string {
	const base = env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/supastarter";
	const url = env.TEST_DATABASE_URL ?? withDatabaseName(base, (name) => `${name}_test`);
	if (env.DATABASE_URL && url === env.DATABASE_URL) {
		throw new Error(
			"Inbox tests refuse to run against DATABASE_URL itself. Set TEST_DATABASE_URL to a separate database.",
		);
	}
	return url;
}

function withDatabaseName(url: string, rename: (name: string) => string): string {
	const parsed = new URL(url);
	parsed.pathname = `/${rename(parsed.pathname.replace(/^\//, ""))}`;
	return parsed.toString();
}

/** A client for one test process. Reused across tests; `$disconnect` reconnects lazily. */
export function createTestInboxClient(url = testDatabaseUrl()): PrismaClient {
	return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/**
 * Create the test database on the server if it is missing, through the `postgres`
 * maintenance database. `CREATE DATABASE` cannot run in a transaction, and
 * `$executeRawUnsafe` does not open one.
 */
export async function ensureTestDatabase(url = testDatabaseUrl()): Promise<void> {
	const name = new URL(url).pathname.replace(/^\//, "");
	const admin = createTestInboxClient(withDatabaseName(url, () => "postgres"));
	try {
		const found = await admin.$queryRaw<
			Array<{ ok: number }>
		>`SELECT 1 AS ok FROM pg_database WHERE datname = ${name}`;
		if (found.length === 0) {
			await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
		}
	} finally {
		await admin.$disconnect();
	}
}

/**
 * The inbox tables, emptied in one statement. Every table that references them does so with
 * `ON DELETE CASCADE` on a required column, so their rows go too: the same end state as
 * `TRUNCATE … CASCADE`, at a fraction of the cost on near-empty tables, and with row locks
 * rather than an exclusive lock on each table (#223).
 */
const EMPTY_INBOX_TABLES = `DO $$ BEGIN
	DELETE FROM "inbox_conversation";
	DELETE FROM "inbox_pipe_connection";
	DELETE FROM "inbox_crm_connection";
	DELETE FROM "inbox_mock_crm_lead";
	DELETE FROM "inbox_mock_crm_outage";
	DELETE FROM "inbox_crm_write_failure";
	DELETE FROM "inbox_webhook_delivery";
	DELETE FROM "inbox_alert";
	DELETE FROM "inbox_lead_tally";
	DELETE FROM "inbox_guest_deletion";
	DELETE FROM "push_subscription";
	DELETE FROM "inbox_office_setting";
END $$`;

/**
 * Empty the inbox tables (children go with them through the foreign keys) and make sure
 * the offices and operators a test names exist, because a thread needs an Organization
 * and an Answer's operator needs a User.
 */
export async function resetInboxTables(
	db: PrismaClient,
	{ offices = [], operators = [] }: { offices?: string[]; operators?: string[] } = {},
): Promise<void> {
	await db.$executeRawUnsafe(EMPTY_INBOX_TABLES);
	const now = new Date();
	for (const id of offices) {
		await db.organization.upsert({
			where: { id },
			create: { id, name: id, slug: id, createdAt: now },
			update: {},
		});
	}
	for (const id of operators) {
		await db.user.upsert({
			where: { id },
			create: {
				id,
				name: id,
				email: `${id}@test.nhip.local`,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			},
			update: {},
		});
	}
}
