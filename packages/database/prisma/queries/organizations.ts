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
 * The office an operator acts for when the session names none (ADR 0008): the first
 * organization they joined. One agency, one office is the MVP, so this is usually the
 * only membership there is.
 */
export async function getFirstOrganizationMembershipForUser(userId: string) {
	return db.member.findFirst({
		where: { userId },
		orderBy: { createdAt: "asc" },
	});
}

/**
 * Create an organization with a fixed id and one owner, and make it that user's active
 * organization. Idempotent: an existing organization is kept, membership is upserted.
 * Used by the seed to create the walk office.
 */
export async function createOrganizationWithOwner({
	id,
	name,
	slug,
	userId,
}: {
	id: string;
	name: string;
	slug: string;
	userId: string;
}) {
	const existing = await db.organization.findUnique({ where: { id } });
	const organization =
		existing ??
		(await db.organization.create({
			data: { id, name, slug, createdAt: new Date() },
		}));
	await db.member.upsert({
		where: { organizationId_userId: { organizationId: id, userId } },
		create: { organizationId: id, userId, role: "owner", createdAt: new Date() },
		update: {},
	});
	await db.user.update({
		where: { id: userId },
		data: { lastActiveOrganizationId: id },
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
