import { getOrganizationMembership } from "@repo/database";
import { checkPermission } from "@repo/permissions";

export async function verifyOrganizationMembership(organizationId: string, userId: string) {
	const membership = await getOrganizationMembership(organizationId, userId);

	if (!membership) {
		return null;
	}

	if (
		!checkPermission(
			{
				membershipRole: membership.role,
			},
			"organization.read",
		)
	) {
		return null;
	}

	return {
		organization: membership.organization,
		role: membership.role,
	};
}

export async function verifyOrganizationBillingManagement(organizationId: string, userId: string) {
	const membership = await verifyOrganizationMembership(organizationId, userId);

	if (
		!membership ||
		!checkPermission(
			{
				membershipRole: membership.role,
			},
			"organization.manageBilling",
		)
	) {
		return null;
	}

	return membership;
}
