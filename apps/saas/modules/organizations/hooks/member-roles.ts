import type { OrganizationMemberRole } from "@repo/auth";
import { organizationMemberRoleOrder } from "@repo/auth/lib/organization-member-role-order";
import { useTranslations } from "next-intl";

/**
 * The roles anyone can be given in Nhịp: Agent (`member`) and Manager (`admin`). The kit's
 * `owner` is the office creator's (the platform admin's) and is never granted (#82).
 */
export const grantableMemberRoles = ["member", "admin"] as const satisfies readonly Exclude<
	OrganizationMemberRole,
	"owner"
>[];

export type GrantableMemberRole = (typeof grantableMemberRoles)[number];

/** Every role's label, `owner` included: an existing owner still reads as a manager. */
export function useOrganizationMemberRoles() {
	const t = useTranslations();

	return Object.fromEntries(
		organizationMemberRoleOrder.map((role) => [role, t(`organizations.roles.${role}`)]),
	) as Record<OrganizationMemberRole, string>;
}

/** The roles a select offers. */
export function useOrganizationMemberRoleOptions() {
	const t = useTranslations();

	return grantableMemberRoles.map((role) => ({
		value: role,
		label: t(`organizations.roles.${role}`),
	}));
}
