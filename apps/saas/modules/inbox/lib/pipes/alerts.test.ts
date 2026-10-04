import { sendEmail } from "@repo/mail";
import { beforeEach, expect, test, vi } from "vitest";

import { testDb, testInboxStore, useTestDatabaseForAppClient } from "../test-store";
import { notifyPipeDisconnected } from "./alerts";

/**
 * A broken pipe (ADR 0017, as amended): every platform admin gets a bell row naming the pipe
 * and the office, since only they reconnect it. Nobody else does, and no one is emailed.
 */
vi.mock("@repo/mail", () => ({ sendEmail: vi.fn(async () => true) }));
useTestDatabaseForAppClient();

const OFFICE = "office-a";
const OA = "oa-alerts";

async function account(id: string, role: string | null, memberRole?: string) {
	await testDb.user.upsert({
		where: { id },
		create: {
			id,
			name: id,
			email: `${id}@test.nhip.local`,
			emailVerified: true,
			role,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		update: { role },
	});
	if (memberRole) {
		await testDb.member.deleteMany({ where: { userId: id } });
		await testDb.member.create({
			data: {
				id: `${id}-m`,
				userId: id,
				organizationId: OFFICE,
				role: memberRole,
				createdAt: new Date(),
			},
		});
	}
}

beforeEach(async () => {
	vi.mocked(sendEmail).mockClear();
	const store = await testInboxStore();
	await store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
	await account("alerts-admin", "admin", "owner");
	await account("alerts-admin-2", "user,admin");
	await account("alerts-manager", "user", "admin");
	await account("alerts-agent", "user", "member");
	await testDb.notification.deleteMany({ where: { type: "PIPE_DISCONNECTED" } });
});

test("a disconnected Zalo OA gives every platform admin one bell row naming the pipe and the office, and emails no one", async () => {
	await notifyPipeDisconnected({ pipe: "zalo", externalId: OA, reason: "refresh refused" });

	const rows = await testDb.notification.findMany({
		where: { type: "PIPE_DISCONNECTED" },
		select: { userId: true, data: true, link: true, user: { select: { role: true } } },
	});
	for (const admin of ["alerts-admin", "alerts-admin-2"]) {
		const own = rows.filter((row) => row.userId === admin);
		expect(own, `${admin} gets one bell row`).toHaveLength(1);
		expect(own[0]?.data).toMatchObject({ pipe: "zalo", office: OFFICE, externalId: OA });
		expect(own[0]?.link).toMatch(new RegExp(`/admin/organizations/${OFFICE}$`));
	}
	expect(
		rows.filter((row) => !row.user.role?.split(",").includes("admin")),
		"only platform admins get it: not the office's manager or agent",
	).toEqual([]);
	expect(sendEmail).not.toHaveBeenCalled();
});
