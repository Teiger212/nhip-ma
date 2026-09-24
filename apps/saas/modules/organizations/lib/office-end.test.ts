import { officeEndHooks } from "@repo/auth/lib/offboarding";
import { beforeEach, expect, test } from "vitest";

import { testDb } from "../../inbox/lib/test-store";

/** No office, no account (ADR 0013), through each path that ends a membership. */
const hooks = officeEndHooks(testDb);
const OFFICE = "office-end-a";
const OTHER_OFFICE = "office-end-b";
const now = new Date();

async function office(id: string) {
	await testDb.organization.create({ data: { id, name: id, slug: id, createdAt: now } });
}

async function account(id: string, role: string | null = null) {
	await testDb.user.create({
		data: {
			id,
			name: id,
			email: `${id}@test.nhip.local`,
			emailVerified: true,
			role,
			createdAt: now,
			updatedAt: now,
		},
	});
	await testDb.session.create({
		data: {
			userId: id,
			token: `token-${id}`,
			expiresAt: new Date(now.getTime() + 3_600_000),
			createdAt: now,
			updatedAt: now,
		},
	});
}

async function join(userId: string, organizationId: string, role = "member") {
	await testDb.member.create({ data: { userId, organizationId, role, createdAt: now } });
}

/** What the kit does before it calls the remove and leave hooks. */
async function dropMembership(userId: string, organizationId: string) {
	await testDb.member.deleteMany({ where: { userId, organizationId } });
}

async function accounts(): Promise<string[]> {
	const users = await testDb.user.findMany({
		where: { id: { startsWith: "end-" } },
		select: { id: true },
		orderBy: { id: "asc" },
	});
	return users.map((user) => user.id);
}

beforeEach(async () => {
	await testDb.user.deleteMany({ where: { id: { startsWith: "end-" } } });
	await testDb.organization.deleteMany({ where: { id: { startsWith: "office-end-" } } });
	await office(OFFICE);
});

test("deleting an office ends its operators' accounts, not the platform admin's", async () => {
	await account("end-admin", "admin");
	await account("end-agent-1");
	await account("end-agent-2");
	await join("end-admin", OFFICE, "owner");
	await join("end-agent-1", OFFICE);
	await join("end-agent-2", OFFICE);
	await testDb.invitation.create({
		data: {
			organizationId: OFFICE,
			email: "new@test.nhip.local",
			status: "pending",
			expiresAt: new Date(now.getTime() + 3_600_000),
			inviterId: "end-agent-1",
		},
	});

	await hooks.beforeDeleteOrganization({ organization: { id: OFFICE } });
	await testDb.organization.delete({ where: { id: OFFICE } });
	await hooks.afterDeleteOrganization({ organization: { id: OFFICE } });

	expect(await accounts()).toEqual(["end-admin"]);
	expect(
		await testDb.session.count({ where: { userId: { in: ["end-agent-1", "end-agent-2"] } } }),
	).toBe(0);
	expect(await testDb.invitation.count({ where: { inviterId: "end-agent-1" } })).toBe(0);
});

test("removing a member ends that account; the office and its other operators stay", async () => {
	await account("end-agent-1");
	await account("end-agent-2");
	await join("end-agent-1", OFFICE);
	await join("end-agent-2", OFFICE);

	await dropMembership("end-agent-1", OFFICE);
	await hooks.afterRemoveMember({ user: { id: "end-agent-1" } });

	expect(await accounts()).toEqual(["end-agent-2"]);
	expect(await testDb.organization.count({ where: { id: OFFICE } })).toBe(1);
});

test("leaving the office ends the account", async () => {
	await account("end-agent-1");
	await join("end-agent-1", OFFICE);

	await dropMembership("end-agent-1", OFFICE);
	await hooks.afterLeave("end-agent-1");

	expect(await accounts()).toEqual([]);
});

test("a leave the kit refused ends nothing: the account still has its office", async () => {
	await account("end-agent-1");
	await join("end-agent-1", OFFICE);

	await hooks.afterLeave("end-agent-1");

	expect(await accounts()).toEqual(["end-agent-1"]);
});

test("an account still in another office is kept", async () => {
	await office(OTHER_OFFICE);
	await account("end-agent-1");
	await join("end-agent-1", OFFICE);
	await join("end-agent-1", OTHER_OFFICE);

	await dropMembership("end-agent-1", OFFICE);
	await hooks.afterRemoveMember({ user: { id: "end-agent-1" } });

	expect(await accounts()).toEqual(["end-agent-1"]);
});

test("the platform admin removed from an office keeps the account", async () => {
	await account("end-admin", "user,admin");
	await join("end-admin", OFFICE, "owner");

	await dropMembership("end-admin", OFFICE);
	await hooks.afterRemoveMember({ user: { id: "end-admin" } });

	expect(await accounts()).toEqual(["end-admin"]);
});
