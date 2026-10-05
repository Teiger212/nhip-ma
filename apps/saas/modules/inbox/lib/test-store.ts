import { createInboxStore, type InboxStore } from "@repo/database/inbox";
import {
	createTestInboxClient,
	resetInboxTables,
	testDatabaseUrl,
} from "@repo/database/inbox/testing";

import { settleBackgroundWork } from "./background";
import { WALK_OFFICE_ID } from "./walk-user";

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
export const TEST_OFFICES = ["office-a", "office-b", WALK_OFFICE_ID];

/** The operators tests approve as. `walk-user` is the mocked session in the API tests. */
export const TEST_OPERATORS = ["agent-1", "agent-2", "walk-user"];

/** Empty the inbox and make sure the fixture offices and operators exist. */
export async function resetTestInbox(): Promise<void> {
	// A previous test's background work (an alert, the auto-reply, a translation) may still hold
	// row locks; TRUNCATE needs an exclusive one, so the two would deadlock (40P01).
	await settleBackgroundWork();
	await resetInboxTables(testDb, { offices: TEST_OFFICES, operators: TEST_OPERATORS });
}

/** A store over the test database with the inbox emptied and the fixtures present. */
export async function testInboxStore(): Promise<InboxStore> {
	await resetTestInbox();
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
			await Promise.race([running, waitingOnALock(settled)]);
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

/** Resolves once another session on the test database waits on a lock, or `settled` is done. */
async function waitingOnALock(settled: { done: boolean }): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (settled.done) return;
		const [row] = await testDb.$queryRaw<Array<{ waiting: number }>>`
			SELECT count(*)::int AS waiting FROM pg_stat_activity
			WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
		if ((row?.waiting ?? 0) > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("deleteThreadUnder: the work under the delete neither finished nor waited");
}
