import {
	createTestInboxClient,
	resetInboxTables,
	testDatabaseUrl,
} from "@repo/database/inbox/testing";
import { expect, test } from "vitest";

test("the test database is never DATABASE_URL, and a reset leaves the fixture rows and no threads", async () => {
	expect(testDatabaseUrl({ DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter" })).toBe(
		"postgresql://u:p@localhost:5432/supastarter_test",
	);
	expect(
		testDatabaseUrl({
			DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter",
			TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/elsewhere",
		}),
	).toBe("postgresql://u:p@localhost:5432/elsewhere");
	expect(() =>
		testDatabaseUrl({
			DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter",
			TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter",
		}),
	).toThrow(/refuse/);

	const db = createTestInboxClient();
	await resetInboxTables(db, { offices: ["office-a"], operators: ["agent-1"] });
	expect(await db.conversation.count()).toBe(0);
	expect(await db.organization.findUnique({ where: { id: "office-a" } })).not.toBeNull();
	expect(await db.user.findUnique({ where: { id: "agent-1" } })).not.toBeNull();
	// Idempotent: the fixtures are upserted, not recreated.
	await resetInboxTables(db, { offices: ["office-a"], operators: ["agent-1"] });
	expect(await db.organization.count({ where: { id: "office-a" } })).toBe(1);
	await db.$disconnect();
});
