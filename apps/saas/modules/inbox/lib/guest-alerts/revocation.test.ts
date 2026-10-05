import { authOptions } from "@repo/auth/auth";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { beforeEach, expect, test } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "../test-store";

/**
 * A device alerts until its sign-in ends (ADR 0019, spec #84 A5; #134): signing out is one
 * way, and so is every other way Better Auth ends a live session. Revoking a session, the
 * user's other sessions, or a ban by the platform admin takes the ended sessions' devices
 * with them. A session that merely expired keeps its device until the account ends or the
 * push service says it is gone. Through the app's own auth options, on the test database.
 */
useTestDatabaseForAppClient();

const auth = betterAuth({ ...authOptions, plugins: [...authOptions.plugins, testUtils()] });

const AGENT = "revoke-agent";
const ADMIN = "revoke-admin";

beforeEach(async () => {
	await testDb.user.deleteMany({ where: { id: { in: [AGENT, ADMIN] } } });
	const now = new Date();
	for (const [id, role] of [
		[AGENT, null],
		[ADMIN, "admin"],
	] as const) {
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
	}
});

async function signIn(userId: string) {
	const { test: helpers } = await auth.$context;
	return helpers.login({ userId });
}

async function deviceFor(userId: string, sessionId: string, name: string) {
	return testDb.pushSubscription.create({
		data: {
			userId,
			sessionId,
			endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
			p256dh: "p256dh",
			auth: "auth",
		},
	});
}

const endpointsOf = async (userId: string) =>
	(await testDb.pushSubscription.findMany({ where: { userId }, orderBy: { endpoint: "asc" } })).map(
		(row) => row.endpoint.split("/").pop(),
	);

test("revoking one session removes its devices, and the others keep theirs", async () => {
	const phone = await signIn(AGENT);
	const laptop = await signIn(AGENT);
	await deviceFor(AGENT, phone.session.id, "phone");
	await deviceFor(AGENT, laptop.session.id, "laptop");

	await auth.api.revokeSession({ headers: laptop.headers, body: { token: phone.token } });

	expect(await endpointsOf(AGENT)).toEqual(["laptop"]);
});

test("revoking the other sessions removes their devices, and this one keeps its own", async () => {
	const phone = await signIn(AGENT);
	const laptop = await signIn(AGENT);
	await deviceFor(AGENT, phone.session.id, "phone");
	await deviceFor(AGENT, laptop.session.id, "laptop");

	await auth.api.revokeOtherSessions({ headers: laptop.headers });

	expect(await endpointsOf(AGENT)).toEqual(["laptop"]);
});

test("a ban by the platform admin ends every session, and every device goes with them", async () => {
	const phone = await signIn(AGENT);
	const laptop = await signIn(AGENT);
	await deviceFor(AGENT, phone.session.id, "phone");
	await deviceFor(AGENT, laptop.session.id, "laptop");
	const admin = await signIn(ADMIN);

	await auth.api.banUser({ headers: admin.headers, body: { userId: AGENT } });

	expect(await endpointsOf(AGENT)).toEqual([]);
});

test("a session that merely expired keeps its device (A5)", async () => {
	const phone = await signIn(AGENT);
	await deviceFor(AGENT, phone.session.id, "phone");
	await testDb.session.update({
		where: { id: phone.session.id },
		data: { expiresAt: new Date(Date.now() - 60_000) },
	});

	// Better Auth deletes an expired session when it is next presented.
	expect(await auth.api.getSession({ headers: phone.headers })).toBeNull();
	expect(await testDb.session.count({ where: { id: phone.session.id } })).toBe(0);

	expect(await endpointsOf(AGENT)).toEqual(["phone"]);
});
