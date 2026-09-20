import { getOrganizationMembershipsForUser } from "@repo/database";

export type OfficeResolution =
	| { officeId: string; denied?: undefined }
	| { officeId?: undefined; denied: "no_office" | "ambiguous_office" };

/**
 * The office (ADR 0008) is the kit organization, and one operator belongs to exactly one
 * (ADR 0010). It is read from the membership table on every request, by the API gate and
 * by server components alike. The session's "active organization" is never consulted: it
 * is a client-writable preference, and a preference cannot grant access.
 */
export async function resolveOffice(userId: string): Promise<OfficeResolution> {
	const memberships = await getOrganizationMembershipsForUser(userId);
	if (memberships.length === 0) {
		return { denied: "no_office" };
	}
	if (memberships.length > 1) {
		console.warn("inbox: operator belongs to more than one office; refusing", {
			userId,
			offices: memberships.map((membership) => membership.organizationId),
		});
		return { denied: "ambiguous_office" };
	}
	return { officeId: memberships[0].organizationId };
}
