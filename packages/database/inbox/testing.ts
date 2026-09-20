import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../prisma/generated/client";

/**
 * Test support for the inbox store. Tests run against their own database, never the one
 * in `DATABASE_URL`: `TEST_DATABASE_URL` when set, else the `DATABASE_URL` database with
 * `_test` appended to its name.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
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
			await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
		}
	} finally {
		await admin.$disconnect();
	}
}

/**
 * Empty the inbox tables (children go with them through the foreign keys) and make sure
 * the offices and operators a test names exist, because a thread needs an Organization
 * and an Answer's operator needs a User.
 */
export async function resetInboxTables(
	db: PrismaClient,
	{ offices = [], operators = [] }: { offices?: string[]; operators?: string[] } = {},
): Promise<void> {
	await db.$executeRawUnsafe(`TRUNCATE "inbox_conversation", "inbox_pipe_connection" CASCADE`);
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
