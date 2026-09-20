import { createTestInboxClient, resetInboxTables } from "@repo/database/inbox/testing";

import { WALK_OFFICE_ID } from "./walk-user";

/** One client per test process; every store-backed test runs on it after a reset. */
export const testDb = createTestInboxClient();

/** The offices tests file threads under. Add to this list rather than inventing ids inline. */
export const TEST_OFFICES = ["office-a", "office-b", WALK_OFFICE_ID];

/** The operators tests approve as. `walk-user` is the mocked session in the API tests. */
export const TEST_OPERATORS = ["agent-1", "agent-2", "walk-user"];

/** Empty the inbox and make sure the fixture offices and operators exist. */
export async function resetTestInbox(): Promise<void> {
	await resetInboxTables(testDb, { offices: TEST_OFFICES, operators: TEST_OPERATORS });
}
