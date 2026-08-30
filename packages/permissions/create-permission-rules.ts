import type { OrganizationMemberRole } from "./definition";

export type PermissionUser = {
	role?: string | null;
} | null;

export type CreatePermissionRulesParams = {
	user?: PermissionUser;
	membershipRole?: string | null;
};

export type PermissionRules = {
	admin: {
		access: boolean;
	};
	organization: {
		read: boolean;
		manage: boolean;
		delete: boolean;
		manageBilling: boolean;
		accessBillingPortal: boolean;
	};
};

function isOrganizationMemberRole(
	membershipRole: string | null | undefined,
): membershipRole is OrganizationMemberRole {
	return membershipRole === "owner" || membershipRole === "admin" || membershipRole === "member";
}

/**
 * Build a Permix rules object from the current user and optional org membership role.
 * Call sites that already resolved membership pass `membershipRole`; otherwise leave it null.
 */
export function createPermissionRules({
	user,
	membershipRole = null,
}: CreatePermissionRulesParams): PermissionRules {
	const isGlobalAdmin = user?.role === "admin";
	const normalizedMembershipRole = isOrganizationMemberRole(membershipRole) ? membershipRole : null;
	const isMember = normalizedMembershipRole !== null;
	const isOrganizationAdminRole =
		normalizedMembershipRole === "owner" || normalizedMembershipRole === "admin";
	const isOrganizationOwnerRole = normalizedMembershipRole === "owner";

	return {
		admin: {
			access: isGlobalAdmin,
		},
		organization: {
			read: isMember,
			manage: isOrganizationAdminRole || isGlobalAdmin,
			delete: isOrganizationOwnerRole,
			manageBilling: isOrganizationAdminRole,
			accessBillingPortal: isOrganizationOwnerRole,
		},
	};
}
