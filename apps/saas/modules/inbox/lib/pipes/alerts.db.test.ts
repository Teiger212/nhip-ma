import { sendEmail } from "@repo/mail";
import { beforeEach, expect, test, vi } from "vitest";

import { account, membership } from "../test-fixtures";
import { testDb, testInboxStore, useTestDatabaseForAppClient } from "../test-store";
import { notifyPipeDisconnected } from "./alerts";

/**
 * A broken pipe (ADR 0017, as amended): every platform admin gets a bell row naming the pipe
 * and the office, since only they reconnect it. Nobody else does, and no one is emailed.
 */
vi.mock("@repo/mail", () => ({ sendEmail: vi.fn(async () => true) }));
useTestDatabaseForAppClient();

const OFFICE = "office-a";
/** The office's name differs from its id, so the row is seen naming the office, not its id. */
const OFFICE_NAME = "Alerts Office";
const OA = "oa-alerts";

beforeEach(async () => {
	vi.mocked(sendEmail).mockClear();
	const store = await testInboxStore();
	await store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
	await testDb.organization.update({ where: { id: OFFICE }, data: { name: OFFICE_NAME } });
	await account("alerts-admin", { role: "admin" });
	await membership(OFFICE, "alerts-admin", "owner");
	await account("alerts-admin-2", { role: "user,admin" });
	await account("alerts-manager", { role: "user" });
	await membership(OFFICE, "alerts-manager", "admin");
	await account("alerts-agent", { role: "user" });
	await membership(OFFICE, "alerts-agent", "member");
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
		expect(own[0]?.data).toMatchObject({ pipe: "zalo", office: OFFICE_NAME, externalId: OA });
		expect(own[0]?.link).toMatch(new RegExp(`/admin/organizations/${OFFICE}$`));
	}
	expect(
		rows.filter((row) => !row.user.role?.split(",").includes("admin")),
		"only platform admins get it: not the office's manager or agent",
	).toEqual([]);
	expect(sendEmail).not.toHaveBeenCalled();
});

test("a platform admin cannot turn the broken-pipe bell row off: it is not in the settings, and a stored preference is ignored", async () => {
	await testDb.userNotificationPreference.create({
		data: { userId: "alerts-admin", type: "PIPE_DISCONNECTED", target: "IN_APP" },
	});
	await notifyPipeDisconnected({ pipe: "zalo", externalId: OA, reason: "refresh refused" });
	expect(
		await testDb.notification.count({
			where: { userId: "alerts-admin", type: "PIPE_DISCONNECTED" },
		}),
	).toBe(1);
});
