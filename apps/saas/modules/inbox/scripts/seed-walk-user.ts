import { hashPassword } from "@repo/auth/lib/password";
import { createUser, createUserAccount, getUserByEmail } from "@repo/database";

import {
	WALK_ADMIN_EMAIL,
	WALK_ADMIN_NAME,
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
