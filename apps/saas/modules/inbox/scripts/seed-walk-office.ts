import { ensureOrganizationMembership, getUserByEmail } from "@repo/database";

import {
	canUseKitAuthDatabase,
	WALK_ADMIN_EMAIL,
	WALK_OFFICE_ID,
	WALK_OFFICE_NAME,
	WALK_OFFICE_SLUG,
	WALK_USER_EMAIL,
} from "../lib/walk-user";

export type WalkOfficeSeedResult = "created" | "exists" | "skipped";

/**
 * The walk office (ADRs 0008, 0010): the kit organization with a fixed id, the walk admin
 * as its owner and the walk agent as a member, each with that office as their active one.
 * Idempotent. In the pilot a real office is created the same way by the admin in
 * `/admin/organizations`, and agents join through its invitation.
 */
export async function seedWalkOffice(
	databaseUrl = process.env.DATABASE_URL,
): Promise<WalkOfficeSeedResult> {
	if (!canUseKitAuthDatabase(databaseUrl)) {
		return "skipped";
	}
	const admin = await getUserByEmail(WALK_ADMIN_EMAIL);
	const agent = await getUserByEmail(WALK_USER_EMAIL);
	if (!admin || !agent) {
		throw new Error("Seed the walk logins before the walk office.");
	}
	const organization = { id: WALK_OFFICE_ID, name: WALK_OFFICE_NAME, slug: WALK_OFFICE_SLUG };
	const owner = await ensureOrganizationMembership({
		organization,
		userId: admin.id,
		role: "owner",
	});
	await ensureOrganizationMembership({ organization, userId: agent.id, role: "member" });
	return owner.created ? "created" : "exists";
}
