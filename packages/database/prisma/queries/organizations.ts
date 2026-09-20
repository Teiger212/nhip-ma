import type { z } from "zod";

import { db } from "../client";
import type { OrganizationSchema } from "../zod";

export async function getOrganizations({
	limit,
	offset,
	query,
}: {
	limit: number;
	offset: number;
	query?: string;
}) {
	return db.organization
		.findMany({
			where: query
				? {
						OR: [
							{
								name: {
									contains: query,
									mode: "insensitive",
								},
							},
						],
					}
				: undefined,
			include: {
				_count: {
					select: {
						members: true,
					},
				},
			},
			take: limit,
			skip: offset,
		})
		.then((res) =>
			res.map((org) => ({
				...org,
				membersCount: org._count.members,
			})),
		);
}

export async function countAllOrganizations({ query }: { query?: string }) {
	return db.organization.count({
		where: query
			? {
					OR: [
						{
							name: {
								contains: query,
								mode: "insensitive",
							},
						},
					],
				}
			: undefined,
	});
}

export async function getOrganizationById(id: string) {
	return db.organization.findUnique({
		where: { id },
		include: {
			members: true,
			invitations: true,
		},
	});
}

export async function getInvitationById(id: string) {
	return db.invitation.findUnique({
		where: { id },
		include: {
			organization: true,
		},
	});
}

export async function getOrganizationBySlug(slug: string) {
	return db.organization.findUnique({
		where: { slug },
	});
}

export async function getOrganizationMembership(organizationId: string, userId: string) {
	return db.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId,
				userId,
			},
		},
		include: {
			organization: true,
		},
	});
}

/**
 * Every office an operator belongs to (ADR 0010). The inbox resolves the office from this
 * on every request and never from a client-writable field; one membership is the rule,
 * zero is "no office", more than one is a misconfiguration the gate refuses.
 */
export async function getOrganizationMembershipsForUser(userId: string) {
	return db.member.findMany({
		where: { userId },
		orderBy: { createdAt: "asc" },
	});
}

/**
 * Ensure an organization with a fixed id exists and that a user is a member of it with
 * the given role, and make it that user's active organization. Idempotent: an existing
 * organization is kept, membership is upserted. Used by the seed for the walk office.
 */
export async function ensureOrganizationMembership({
	organization: input,
	userId,
	role,
}: {
	organization: { id: string; name: string; slug: string };
	userId: string;
	role: "owner" | "admin" | "member";
}) {
	const existing = await db.organization.findUnique({ where: { id: input.id } });
	const organization =
		existing ??
		(await db.organization.create({
			data: { id: input.id, name: input.name, slug: input.slug, createdAt: new Date() },
		}));
	await db.member.upsert({
		where: { organizationId_userId: { organizationId: input.id, userId } },
		create: { organizationId: input.id, userId, role, createdAt: new Date() },
		update: { role },
	});
	await db.user.update({
		where: { id: userId },
		data: { lastActiveOrganizationId: input.id },
	});
	return { organization, created: !existing };
}

export async function getOrganizationWithPurchasesAndMembersCount(organizationId: string) {
	const organization = await db.organization.findUnique({
		where: {
			id: organizationId,
		},
		include: {
			purchases: true,
			_count: {
				select: {
					members: true,
				},
			},
		},
	});

	return organization
		? {
				...organization,
				membersCount: organization._count.members,
			}
		: null;
}

export async function getPendingInvitationByEmail(email: string) {
	return db.invitation.findFirst({
		where: {
			email,
			status: "pending",
		},
	});
}

export async function updateOrganization(
	organization: Partial<z.infer<typeof OrganizationSchema>> & { id: string },
) {
	return db.organization.update({
		where: {
			id: organization.id,
		},
		data: organization,
	});
}
