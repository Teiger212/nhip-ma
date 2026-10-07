import { beforeEach } from "vitest";

import { resetTestDatabase } from "./modules/inbox/lib/test-store";

/**
 * Every db test starts from the same rows: the fixture offices and operators and nothing else.
 * Runs before the test file's own `beforeEach`, so a file adds the people and threads it needs
 * on top, and never cleans up after itself (#223).
 */
beforeEach(async () => {
	await resetTestDatabase();
});
