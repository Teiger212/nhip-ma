import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { getOrganizationMembershipsForUser } from "@repo/database";

export type OfficeDenial = "no_office" | "ambiguous_office" | "platform_admin";

export type OfficeResolution =
	| { officeId: string; denied?: undefined }
	| { officeId?: undefined; denied: OfficeDenial };

/**
 * The office (ADR 0008) is the kit organization, and one operator belongs to exactly one
 * (ADR 0010). It is read from the membership table on every request, by the API gate and
 * by server components alike. The session's "active organization" is never consulted: it
 * is a client-writable preference, and a preference cannot grant access.
 *
 * The platform admin is refused first, whatever memberships they hold: the kit makes an
 * office's creator its owner, and that membership opens no guests (ADR 0015).
 */
export async function resolveOffice(user: {
	id: string;
	role?: string | null;
}): Promise<OfficeResolution> {
	if (isPlatformAdmin(user.role)) {
		return { denied: "platform_admin" };
	}
	const memberships = await getOrganizationMembershipsForUser(user.id);
	if (memberships.length === 0) {
		return { denied: "no_office" };
	}
	if (memberships.length > 1) {
		console.warn("inbox: operator belongs to more than one office; refusing", {
			userId: user.id,
			offices: memberships.map((membership) => membership.organizationId),
		});
		return { denied: "ambiguous_office" };
	}
	return { officeId: memberships[0].organizationId };
}
