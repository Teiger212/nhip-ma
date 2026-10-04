import { createInboxStore, type InboxStore } from "@repo/database/inbox";
import {
	createTestInboxClient,
	resetInboxTables,
	testDatabaseUrl,
} from "@repo/database/inbox/testing";

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
	await resetInboxTables(testDb, { offices: TEST_OFFICES, operators: TEST_OPERATORS });
}

/** A store over the test database with the inbox emptied and the fixtures present. */
export async function testInboxStore(): Promise<InboxStore> {
	await resetTestInbox();
	return createInboxStore(testDb);
}
