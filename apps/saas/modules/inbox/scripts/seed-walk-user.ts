import { hashPassword } from "@repo/auth/lib/password";
import { createUser, createUserAccount, getUserByEmail } from "@repo/database";

import {
	RIVER_AGENT2_EMAIL,
	RIVER_AGENT2_NAME,
	RIVER_AGENT_EMAIL,
	RIVER_AGENT_NAME,
	RIVER_MANAGER_EMAIL,
	RIVER_MANAGER_NAME,
	WALK_ADMIN_EMAIL,
	WALK_ADMIN_NAME,
	WALK_AGENT2_EMAIL,
	WALK_AGENT2_NAME,
	WALK_MANAGER_EMAIL,
	WALK_MANAGER_NAME,
	WALK_USER_EMAIL,
	WALK_USER_NAME,
	WALK_USER_PASSWORD,
} from "../lib/walk-user";

export type WalkUserSeedResult = "created" | "exists";

async function seedLogin(login: {
	email: string;
	name: string;
	role: "admin" | "user";
}): Promise<WalkUserSeedResult> {
	const existing = await getUserByEmail(login.email);
	if (existing) {
		return "exists";
	}

	const hashedPassword = await hashPassword(WALK_USER_PASSWORD);
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

/** The agent login. */
export async function seedWalkUser(): Promise<WalkUserSeedResult> {
	return seedLogin({ email: WALK_USER_EMAIL, name: WALK_USER_NAME, role: "user" });
}

/** The platform admin login (ADR 0010): the account that creates offices and invites agents. */
export async function seedWalkAdmin(): Promise<WalkUserSeedResult> {
	return seedLogin({ email: WALK_ADMIN_EMAIL, name: WALK_ADMIN_NAME, role: "admin" });
}

/** The second agent (ADR 0015). */
export async function seedWalkAgent2(): Promise<WalkUserSeedResult> {
	return seedLogin({ email: WALK_AGENT2_EMAIL, name: WALK_AGENT2_NAME, role: "user" });
}

/** The walk office's manager (ADR 0015): an ordinary user; the office membership makes them a manager. */
export async function seedWalkManager(): Promise<WalkUserSeedResult> {
	return seedLogin({ email: WALK_MANAGER_EMAIL, name: WALK_MANAGER_NAME, role: "user" });
}

/** The second office's logins (#69): its manager and two agents, ordinary users all. */
export async function seedRiverLogins(): Promise<Record<string, WalkUserSeedResult>> {
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
