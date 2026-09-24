import { db } from "../client";

type Client = typeof db;

/** The platform admin (`role` "admin", alone or in a comma list) is never an ended account. */
function isPlatformAdmin(role: string | null): boolean {
	return role?.split(",").includes("admin") ?? false;
}

/** The users in an office, read before the office is deleted (ADR 0013). */
export async function getOfficeMemberIds(officeId: string, client: Client = db): Promise<string[]> {
	const members = await client.member.findMany({
		where: { organizationId: officeId },
		select: { userId: true },
	});
	return members.map((member) => member.userId);
}

/**
 * No office, no account (ADR 0013): of the given users, the ones left in no office, the
 * platform admin excepted. The caller deletes them through Better Auth.
 */
export async function findAccountsWithoutOffice(
	userIds: string[],
	client: Client = db,
): Promise<string[]> {
	if (userIds.length === 0) return [];
	const officeless = await client.user.findMany({
		where: { id: { in: userIds }, members: { none: {} } },
		select: { id: true, role: true },
	});
	return officeless.filter((user) => !isPlatformAdmin(user.role)).map((user) => user.id);
}

/** The name an Answer keeps for its sender: the account name, else the email (ADR 0013). */
export function operatorNameOf(user: { name: string; email: string }): string {
	return user.name.trim() || user.email;
}

/** Fill `operatorName` on Answers approved before ADR 0013. Idempotent; returns rows filled. */
export async function backfillAnswerOperatorNames(client: Client = db): Promise<number> {
	const answers = await client.answer.findMany({
		where: { operatorName: null, operator: { isNot: null } },
		select: { id: true, operator: { select: { name: true, email: true } } },
	});
	for (const answer of answers) {
		if (!answer.operator) continue;
		await client.answer.update({
			where: { id: answer.id },
			data: { operatorName: operatorNameOf(answer.operator) },
		});
	}
	return answers.length;
}
