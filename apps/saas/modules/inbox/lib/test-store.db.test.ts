import {
	createTestInboxClient,
	resetInboxTables,
	testDatabaseUrl,
} from "@repo/database/inbox/testing";
import { expect, test } from "vitest";

import { guestMessage } from "./test-fixtures";
import {
	resetTestDatabase,
	TEST_OFFICES,
	TEST_OPERATORS,
	testDb,
	testInboxStore,
} from "./test-store";

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

// #223: every db test starts from this reset, so no test depends on what another left behind.
test("the per-test reset leaves the fixture offices and operators alone, as new, whatever a test left", async () => {
	const at = new Date();
	await testDb.organization.create({ data: { id: "left-office", name: "Left", createdAt: at } });
	await testDb.organization.update({ where: { id: "office-a" }, data: { name: "Renamed" } });
	await testDb.user.create({
		data: {
			id: "left-user",
			name: "Left",
			email: "left-user@test.nhip.local",
			emailVerified: true,
			createdAt: at,
			updatedAt: at,
		},
	});
	await testDb.user.update({ where: { id: "agent-1" }, data: { locale: "en", role: "admin" } });
	await testDb.member.create({
		data: {
			id: "left-m",
			organizationId: "office-a",
			userId: "agent-1",
			role: "member",
			createdAt: at,
		},
	});
	await testDb.notification.create({ data: { userId: "agent-1", type: "APP_UPDATE" } });
	await testDb.verification.create({
		data: { identifier: "left", value: "left", expiresAt: at },
	});
	await testDb.rateLimit.create({
		data: { key: "left", count: 1, lastRequest: BigInt(at.getTime()) },
	});
	await testDb.purchase.create({
		data: { type: "ONE_TIME", customerId: "left", priceId: "left" },
	});
	await (await testInboxStore()).upsertInbound(guestMessage("left-guest"), "office-b");

	await resetTestDatabase();

	expect(
		await testDb.organization.findMany({
			select: { id: true, name: true },
			orderBy: { id: "asc" },
		}),
	).toEqual([...TEST_OFFICES].sort().map((id) => ({ id, name: id })));
	expect(
		await testDb.user.findMany({
			select: { id: true, locale: true, role: true },
			orderBy: { id: "asc" },
		}),
	).toEqual([...TEST_OPERATORS].sort().map((id) => ({ id, locale: null, role: null })));
	expect(await testDb.member.count()).toBe(0);
	expect(await testDb.notification.count()).toBe(0);
	expect(await testDb.verification.count()).toBe(0);
	expect(await testDb.rateLimit.count()).toBe(0);
	expect(await testDb.purchase.count()).toBe(0);
	expect(await testDb.conversation.count()).toBe(0);
});
