import { keepOldestMembership } from "@repo/database";
import { beforeEach, expect, test } from "vitest";

import { testDb } from "../../inbox/lib/test-store";

/** One operator, one office (ADR 0010), held when two invitations are accepted at once. */
const now = Date.now();

async function office(id: string) {
	await testDb.organization.create({ data: { id, name: id, slug: id, createdAt: new Date() } });
}

async function account(id: string, role: string | null = null) {
	await testDb.user.create({
		data: {
			id,
			name: id,
			email: `${id}@test.nhip.local`,
			emailVerified: true,
			role,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

async function join(id: string, userId: string, organizationId: string, at: number) {
	await testDb.member.create({
		data: { id, userId, organizationId, role: "member", createdAt: new Date(at) },
	});
}

async function offices(userId: string): Promise<string[]> {
	const rows = await testDb.member.findMany({
		where: { userId },
		orderBy: { organizationId: "asc" },
	});
	return rows.map((row) => row.organizationId);
}

beforeEach(async () => {
	await testDb.user.deleteMany({ where: { id: { startsWith: "one-" } } });
	await testDb.organization.deleteMany({ where: { id: { startsWith: "office-one-" } } });
	await office("office-one-a");
	await office("office-one-b");
});

test("a second membership is dropped and the first office is kept", async () => {
	await account("one-agent");
	await join("one-m1", "one-agent", "office-one-a", now);
	await join("one-m2", "one-agent", "office-one-b", now + 5);
	expect(await keepOldestMembership("one-agent", testDb)).toEqual(["one-m2"]);
	expect(await offices("one-agent")).toEqual(["office-one-a"]);
});

test("two accepts in the same millisecond settle the same way whichever runs first", async () => {
	await account("one-agent");
	await join("one-m2", "one-agent", "office-one-b", now);
	await join("one-m1", "one-agent", "office-one-a", now);
	const [first, second] = await Promise.all([
		keepOldestMembership("one-agent", testDb),
		keepOldestMembership("one-agent", testDb),
	]);
	expect([...first, ...second]).toContain("one-m2");
	expect(await offices("one-agent")).toEqual(["office-one-a"]);
});

test("one membership is left alone, and the platform admin is exempt", async () => {
	await account("one-agent");
	await account("one-admin", "admin");
	await join("one-m1", "one-agent", "office-one-a", now);
	await join("one-a1", "one-admin", "office-one-a", now);
	await join("one-a2", "one-admin", "office-one-b", now + 5);
	expect(await keepOldestMembership("one-agent", testDb)).toEqual([]);
	expect(await keepOldestMembership("one-admin", testDb)).toEqual([]);
	expect(await offices("one-admin")).toEqual(["office-one-a", "office-one-b"]);
});
