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

/** Waits until some statement is waiting on a lock, its text matching `query`. */
async function waitForLockWait(query: string) {
	for (let i = 0; i < 100; i++) {
		const rows = await testDb.$queryRaw<{ n: bigint }[]>`
			SELECT count(*) AS n FROM pg_stat_activity
			WHERE wait_event_type = 'Lock' AND query ILIKE ${`%${query}%`}`;
		if (Number(rows[0]?.n ?? 0) > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`nothing waited on a lock for ${query}`);
}

test("a device registered while its sign-in is being revoked does not outlive it (#135)", async () => {
	const phone = await signIn(AGENT);
	const laptop = await signIn(AGENT);
	let revoking: Promise<unknown> | undefined;

	// A registration in flight: it holds the session row as `addPushSubscription` does and stores
	// the device; the revoke's before-hook can't see it yet, and its delete waits on the row.
	await testDb.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT "id" FROM "session" WHERE "id" = ${phone.session.id} FOR SHARE`;
		await tx.pushSubscription.create({
			data: {
				userId: AGENT,
				sessionId: phone.session.id,
				endpoint: "https://fcm.googleapis.com/fcm/send/in-flight",
				p256dh: "p256dh",
				auth: "auth",
			},
		});
		revoking = auth.api.revokeSession({ headers: laptop.headers, body: { token: phone.token } });
		await waitForLockWait("session");
	});
	await revoking;

	expect(await testDb.session.count({ where: { id: phone.session.id } })).toBe(0);
	expect(await endpointsOf(AGENT)).toEqual([]);
});
