import { ensureOrganizationMembership, getUserByEmail, updateOrganization } from "@repo/database";

import {
	RIVER_AGENT2_EMAIL,
	RIVER_AGENT_EMAIL,
	RIVER_MANAGER_EMAIL,
	RIVER_OFFICE_ID,
	RIVER_OFFICE_NAME,
	RIVER_OFFICE_SLUG,
	WALK_ADMIN_EMAIL,
	WALK_AGENT2_EMAIL,
	WALK_MANAGER_EMAIL,
	WALK_OFFICE_ID,
	WALK_OFFICE_NAME,
	WALK_OFFICE_SLUG,
	WALK_USER_EMAIL,
} from "../lib/walk-user";

export type WalkOfficeSeedResult = "created" | "exists";

/**
 * The walk office (ADRs 0008, 0010, 0015): the kit organization with a fixed id, the platform
 * admin as its (inert) owner, two agents as members and a manager as kit admin, each with that
 * office as their active one.
 * Idempotent. In the pilot a real office is created the same way by the admin in
 * `/admin/organizations`, and agents join through its invitation.
 */
export async function seedWalkOffice(): Promise<WalkOfficeSeedResult> {
	const admin = await getUserByEmail(WALK_ADMIN_EMAIL);
	const agent = await getUserByEmail(WALK_USER_EMAIL);
	const agent2 = await getUserByEmail(WALK_AGENT2_EMAIL);
	const manager = await getUserByEmail(WALK_MANAGER_EMAIL);
	if (!admin || !agent || !agent2 || !manager) {
		throw new Error("Seed the walk logins before the walk office.");
	}
	const organization = { id: WALK_OFFICE_ID, name: WALK_OFFICE_NAME, slug: WALK_OFFICE_SLUG };
	const owner = await ensureOrganizationMembership({
		organization,
		userId: admin.id,
		role: "owner",
	});
	await ensureOrganizationMembership({ organization, userId: agent.id, role: "member" });
	await ensureOrganizationMembership({ organization, userId: agent2.id, role: "member" });
	// The office's manager is kit `admin`; kit `owner` is the platform admin's inert membership.
	await ensureOrganizationMembership({ organization, userId: manager.id, role: "admin" });
	// An office seeded before #264 is still called "Walk Office": rename it, keeping its id.
	if (owner.organization.name !== WALK_OFFICE_NAME) {
		await updateOrganization({ id: WALK_OFFICE_ID, name: WALK_OFFICE_NAME });
	}
	return owner.created ? "created" : "exists";
}

/**
 * The second office (#69): the platform admin as its (inert) owner, as for any office they
 * create, its own manager as kit admin and two agents as members. Its operators belong to it
 * alone. Seed it before the walk office, so the platform admin's active office stays the walk
 * office. Idempotent.
 */
export async function seedRiverOffice(): Promise<WalkOfficeSeedResult> {
	const admin = await getUserByEmail(WALK_ADMIN_EMAIL);
	const manager = await getUserByEmail(RIVER_MANAGER_EMAIL);
	const agent = await getUserByEmail(RIVER_AGENT_EMAIL);
	const agent2 = await getUserByEmail(RIVER_AGENT2_EMAIL);
	if (!admin || !manager || !agent || !agent2) {
		throw new Error("Seed the second office's logins before the office.");
	}
	const organization = { id: RIVER_OFFICE_ID, name: RIVER_OFFICE_NAME, slug: RIVER_OFFICE_SLUG };
	const owner = await ensureOrganizationMembership({
		organization,
		userId: admin.id,
		role: "owner",
	});
	await ensureOrganizationMembership({ organization, userId: manager.id, role: "admin" });
	await ensureOrganizationMembership({ organization, userId: agent.id, role: "member" });
	await ensureOrganizationMembership({ organization, userId: agent2.id, role: "member" });
	return owner.created ? "created" : "exists";
}
