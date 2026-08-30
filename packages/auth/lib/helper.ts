import { checkPermission } from "@repo/permissions";

import type { ActiveOrganization } from "../auth";

function getOrganizationRole(
	organization?: ActiveOrganization | null,
	user?: {
		id: string;
		role?: string | null;
	} | null,
) {
	return organization?.members.find((member) => member.userId === user?.id)?.role;
}

/**
 * Whether the user can manage the organization (owner/admin, or global admin).
 * Thin wrapper over `@repo/permissions` — prefer `check('organization.manage')` in new code.
 */
export function isOrganizationAdmin(
	organization?: ActiveOrganization | null,
	user?: {
		id: string;
		role?: string | null;
	} | null,
) {
	return checkPermission(
		{
			user,
			membershipRole: getOrganizationRole(organization, user),
		},
		"organization.manage",
	);
}

/**
 * Whether the user is the organization owner.
 * Thin wrapper over `@repo/permissions` — prefer `check('organization.delete')` in new code
 * when gating destructive owner-only actions.
 */
export function isOrganizationOwner(
	organization?: ActiveOrganization | null,
	user?: {
		id: string;
		role?: string | null;
	} | null,
) {
	return checkPermission(
		{
			user,
			membershipRole: getOrganizationRole(organization, user),
		},
		"organization.delete",
	);
}
