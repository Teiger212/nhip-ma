import { hashPassword } from "@repo/auth/lib/password";
import { createUser, createUserAccount, getUserByEmail } from "@repo/database";

import {
	canUseKitAuthDatabase,
	WALK_USER_EMAIL,
	WALK_USER_NAME,
	WALK_USER_PASSWORD,
} from "../lib/walk-user";

export type WalkUserSeedResult = "created" | "exists" | "skipped";

export async function seedWalkUser(
	databaseUrl = process.env.DATABASE_URL,
): Promise<WalkUserSeedResult> {
	if (!canUseKitAuthDatabase(databaseUrl)) {
		return "skipped";
	}

	const existing = await getUserByEmail(WALK_USER_EMAIL);
	if (existing) {
		return "exists";
	}

	const hashedPassword = await hashPassword(WALK_USER_PASSWORD);
	const user = await createUser({
		email: WALK_USER_EMAIL,
		name: WALK_USER_NAME,
		role: "user",
		emailVerified: true,
		onboardingComplete: true,
	});

	if (!user) {
		throw new Error("Failed to create the walk login user.");
	}

	await createUserAccount({
		userId: user.id,
		providerId: "credential",
		accountId: user.id,
		hashedPassword,
	});

	return "created";
}
