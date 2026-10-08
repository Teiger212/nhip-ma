import { hashPassword } from "@repo/auth/lib/password";
import { createUser, createUserAccount, db, getUserByEmail, updateUser } from "@repo/database";

import {
	LEGACY_DEMO_LOGINS,
	RIVER_AGENT2_EMAIL,
	RIVER_AGENT2_NAME,
	RIVER_AGENT_EMAIL,
	RIVER_AGENT_NAME,
	RIVER_MANAGER_EMAIL,
	RIVER_MANAGER_NAME,
	DEMO_ADMIN_EMAIL,
	DEMO_ADMIN_NAME,
	DEMO_AGENT2_EMAIL,
	DEMO_AGENT2_NAME,
	DEMO_MANAGER_EMAIL,
	DEMO_MANAGER_NAME,
	DEMO_AGENT_EMAIL,
	DEMO_AGENT_NAME,
	DEMO_PASSWORD,
} from "../lib/demo-user";

export type DemoUserSeedResult = "created" | "exists";

async function seedLogin(login: {
	email: string;
	name: string;
	role: "admin" | "user";
}): Promise<DemoUserSeedResult> {
	const existing = await getUserByEmail(login.email);
	if (existing) {
		return "exists";
	}

	const hashedPassword = await hashPassword(DEMO_PASSWORD);
	const user = await createUser({
		email: login.email,
		name: login.name,
		role: login.role,
		emailVerified: true,
		onboardingComplete: true,
	});

	if (!user) {
		throw new Error(`Failed to create the walk login ${login.email}.`);
	}

	await createUserAccount({
		userId: user.id,
		providerId: "credential",
		accountId: user.id,
		hashedPassword,
	});

	return "created";
}

/**
 * Retires the walk logins from before #264 (`walk@`, `walk2@`, `manager@`): each is renamed in
 * place to its successor, keeping its user id (and so its sessions, office membership and thread
 * ownership). If the successor already exists, the old login is deleted instead. Idempotent;
 * returns how many it retired. Run before the logins are seeded.
 */
export async function retireLegacyWalkLogins(): Promise<number> {
	let retired = 0;
	for (const { from, to, name } of LEGACY_DEMO_LOGINS) {
		const legacy = await getUserByEmail(from);
		if (!legacy) continue;
		if (await getUserByEmail(to)) {
			await db.user.delete({ where: { id: legacy.id } });
		} else {
			await updateUser({ id: legacy.id, email: to, name });
		}
		retired += 1;
	}
	return retired;
}

/** The agent login. */
export async function seedDemoUser(): Promise<DemoUserSeedResult> {
	return seedLogin({ email: DEMO_AGENT_EMAIL, name: DEMO_AGENT_NAME, role: "user" });
}

/** The platform admin login (ADR 0010): the account that creates offices and invites agents. */
export async function seedDemoAdmin(): Promise<DemoUserSeedResult> {
	return seedLogin({ email: DEMO_ADMIN_EMAIL, name: DEMO_ADMIN_NAME, role: "admin" });
}

/** The second agent (ADR 0015). */
export async function seedDemoAgent2(): Promise<DemoUserSeedResult> {
	return seedLogin({ email: DEMO_AGENT2_EMAIL, name: DEMO_AGENT2_NAME, role: "user" });
}

/** The walk office's manager (ADR 0015): an ordinary user; the office membership makes them a manager. */
export async function seedDemoManager(): Promise<DemoUserSeedResult> {
	return seedLogin({ email: DEMO_MANAGER_EMAIL, name: DEMO_MANAGER_NAME, role: "user" });
}

/** The second office's logins (#69): its manager and two agents, ordinary users all. */
export async function seedRiverLogins(): Promise<Record<string, DemoUserSeedResult>> {
	return {
		[RIVER_MANAGER_EMAIL]: await seedLogin({
			email: RIVER_MANAGER_EMAIL,
			name: RIVER_MANAGER_NAME,
			role: "user",
		}),
		[RIVER_AGENT_EMAIL]: await seedLogin({
			email: RIVER_AGENT_EMAIL,
			name: RIVER_AGENT_NAME,
			role: "user",
		}),
		[RIVER_AGENT2_EMAIL]: await seedLogin({
			email: RIVER_AGENT2_EMAIL,
			name: RIVER_AGENT2_NAME,
			role: "user",
		}),
	};
}
