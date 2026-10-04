import { sendEmail } from "@repo/mail";
import { createNotification, NOTIFICATION_TYPES } from "@repo/notifications";
import { beforeEach, expect, test, vi } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "../../inbox/lib/test-store";

/**
 * No notification emails (PRODUCT.md "Deliberately not", ADR 0019): a notification is a bell
 * row only, whatever the person's email preferences say. The one exception is the kit's
 * welcome, emailed when a person joins.
 */
vi.mock("@repo/mail", () => ({ sendEmail: vi.fn(async () => true) }));
useTestDatabaseForAppClient();

const USER = "notify-user";

beforeEach(async () => {
	vi.mocked(sendEmail).mockClear();
	await testDb.user.upsert({
		where: { id: USER },
		create: {
			id: USER,
			name: USER,
			email: `${USER}@test.nhip.local`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		update: {},
	});
	// Email left on: no preference turns any type or channel off.
	await testDb.userNotificationPreference.deleteMany({ where: { userId: USER } });
	await testDb.notification.deleteMany({ where: { userId: USER } });
});

test("a notification other than the welcome is a bell row and is never emailed, with email on in preferences", async () => {
	const others = Object.values(NOTIFICATION_TYPES).filter((type) => type !== "WELCOME");
	for (const type of others) {
		await createNotification({ userId: USER, type, data: { title: `A ${type}` } });
	}
	const rows = await testDb.notification.findMany({ where: { userId: USER } });
	expect(rows.map((row) => row.type).sort()).toEqual([...others].sort());
	expect(sendEmail).not.toHaveBeenCalled();
});

test("the welcome is still emailed, once, besides its bell row", async () => {
	await createNotification({ userId: USER, type: "WELCOME", data: { title: "Welcome!" } });
	const rows = await testDb.notification.findMany({ where: { userId: USER } });
	expect(rows.map((row) => row.type)).toEqual(["WELCOME"]);
	expect(sendEmail).toHaveBeenCalledTimes(1);
	expect(vi.mocked(sendEmail).mock.calls[0]?.[0]).toMatchObject({
		to: `${USER}@test.nhip.local`,
	});
});
