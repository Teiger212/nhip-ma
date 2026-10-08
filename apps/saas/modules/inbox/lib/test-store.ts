import { createInboxStore, type InboxStore } from "@repo/database/inbox";
import {
	createTestInboxClient,
	resetTestDatabase as resetDatabase,
	testDatabaseUrl,
} from "@repo/database/inbox/testing";

import { settleBackgroundWork } from "./background";
import { DEMO_OFFICE_ID } from "./demo-user";

// Unit files run in parallel; only the db project runs its files one at a time on the database.
if (process.env.NHIP_DB_TESTS !== "1") {
	throw new Error(
		"test-store is for *.db.test.ts files: they run one at a time in the Vitest db project. Rename this test file.",
	);
}

const TEST_DATABASE_URL = testDatabaseUrl();

/** One client per test process; every store-backed test runs on it after a reset. */
export const testDb = createTestInboxClient(TEST_DATABASE_URL);

/**
 * Code under test that uses the app's own client (`db` from `@repo/database`, made on first
 * use from DATABASE_URL) runs on the test database too. Call it at the top of the test file,
 * before anything touches `db`.
 */
export function useTestDatabaseForAppClient(): void {
	process.env.DATABASE_URL = TEST_DATABASE_URL;
}

/** The offices tests file threads under. Add to this list rather than inventing ids inline. */
export const TEST_OFFICES = ["office-a", "office-b", DEMO_OFFICE_ID];

/** The operators tests approve as. `walk-user` is the mocked session in the API tests. */
export const TEST_OPERATORS = ["agent-1", "agent-2", "walk-user"];

/**
 * Bring the test database back to the fixture offices and operators alone, every other row
 * gone. `vitest.db-setup.ts` runs it before every db test; call it yourself only to start
 * over in the middle of one.
 */
export async function resetTestDatabase(): Promise<void> {
	// A previous test's background work (an alert, the auto-reply, a translation) may still hold
	// row locks the reset's deletes need, so the two could deadlock (40P01).
	await settleBackgroundWork();
	await resetDatabase(testDb, { offices: TEST_OFFICES, operators: TEST_OPERATORS });
}

/** A store over the test database, which every db test starts with reset. */
export async function testInboxStore(): Promise<InboxStore> {
	return createInboxStore(testDb);
}

/**
 * Delete a thread the way guest deletion does (ADR 0020, "How it is built"): one
 * transaction locks the conversation `FOR UPDATE`, then its Answers, then deletes it. `during`
 * starts while the conversation is locked, and the delete commits only once `during` waits
 * on a lock or has finished, so "a delete committed under an approval" happens on every run,
 * not by chance. Returns what `during` returned, or throws what it threw.
 */
export async function deleteThreadUnder<T>(
	officeId: string,
	conversationId: string,
	during: () => Promise<T>,
): Promise<T> {
	let running: Promise<{ ok: true; value: T } | { ok: false; error: unknown }> | undefined;
	await testDb.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT 1 FROM "inbox_conversation" WHERE "id" = ${conversationId} AND "officeId" = ${officeId} FOR UPDATE`;
			const settled = { done: false };
			// Not awaited here: `during` must run while this transaction holds the lock.
			running = (async () => {
				try {
					return { ok: true as const, value: await during() };
				} catch (error) {
					return { ok: false as const, error };
				} finally {
					settled.done = true;
				}
			})();
			await Promise.race([running, waitForLockWaiters(1, { unless: () => settled.done })]);
			settled.done = true;
			await tx.$queryRaw`SELECT 1 FROM "inbox_answer" WHERE "conversationId" = ${conversationId} AND "officeId" = ${officeId} FOR UPDATE`;
			await tx.conversation.deleteMany({ where: { id: conversationId, officeId } });
		},
		{ timeout: 15_000 },
	);
	const outcome = await running!;
	if (!outcome.ok) throw outcome.error;
	return outcome.value;
}

/**
 * Resolves once `count` other sessions wait on a lock, or as soon as `unless()` is true; throws
 * after 5 s. Only sessions on this run's own test database count: E2E, other worktrees and the
 * dev server share the Postgres server, and a lock wait of theirs proves nothing here. `query`
 * narrows it to waiting statements whose text contains it.
 */
export async function waitForLockWaiters(
	count: number,
	{ query, unless }: { query?: string; unless?: () => boolean } = {},
): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (unless?.()) return;
		const [row] = await testDb.$queryRaw<Array<{ waiting: number }>>`
			SELECT count(*)::int AS waiting FROM pg_stat_activity
			WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
				AND (${query ?? null}::text IS NULL OR query ILIKE ${`%${query ?? ""}%`})`;
		if ((row?.waiting ?? 0) >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(
		`waitForLockWaiters: ${count} never waited on a lock${query ? ` for ${query}` : ""}`,
	);
}
