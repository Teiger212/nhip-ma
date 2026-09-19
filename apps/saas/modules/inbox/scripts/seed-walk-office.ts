import { createOrganizationWithOwner, getUserByEmail } from "@repo/database";

import {
	canUseKitAuthDatabase,
	WALK_OFFICE_ID,
	WALK_OFFICE_NAME,
	WALK_OFFICE_SLUG,
	WALK_USER_EMAIL,
} from "../lib/walk-user";

export type WalkOfficeSeedResult = "created" | "exists" | "skipped";

/**
 * The walk operator's office (ADR 0008): the kit organization with a fixed id, the walk
 * user as its owner, and that office made the user's active one. Idempotent.
 */
export async function seedWalkOffice(
	databaseUrl = process.env.DATABASE_URL,
): Promise<WalkOfficeSeedResult> {
	if (!canUseKitAuthDatabase(databaseUrl)) {
		return "skipped";
	}
	const user = await getUserByEmail(WALK_USER_EMAIL);
	if (!user) {
		throw new Error("Seed the walk login before the walk office.");
	}
	const result = await createOrganizationWithOwner({
		id: WALK_OFFICE_ID,
		name: WALK_OFFICE_NAME,
		slug: WALK_OFFICE_SLUG,
		userId: user.id,
	});
	return result.created ? "created" : "exists";
}
