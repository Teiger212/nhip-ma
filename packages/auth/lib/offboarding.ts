import { db, findAccountsWithoutOffice, getOfficeMemberIds } from "@repo/database";

/**
 * No office, no account (ADR 0013). Every path that ends a membership ends the account
 * too, the platform admin's excepted: deleting the office, removing the member, leaving.
 * The kit's leave route fires no organization hook, so `afterLeave` runs from the auth
 * after-hook on `/organization/leave`. `deleteAccount` is Better Auth's own user delete, so
 * `databaseHooks.user.delete` (subscription cancellation) runs as on every other path.
 */
export function officeEndHooks({
	deleteAccount,
	client = db,
}: {
	deleteAccount: (userId: string) => Promise<void>;
	client?: typeof db;
}) {
	const endAccountsWithoutOffice = async (userIds: string[]) => {
		for (const userId of await findAccountsWithoutOffice(userIds, client)) {
			await deleteAccount(userId);
		}
	};
	// An office's members are gone by the time `afterDeleteOrganization` runs.
	const membersOfDeleted = new Map<string, string[]>();

	return {
		beforeDeleteOrganization: async ({ organization }: { organization: { id: string } }) => {
			membersOfDeleted.set(organization.id, await getOfficeMemberIds(organization.id, client));
		},
		afterDeleteOrganization: async ({ organization }: { organization: { id: string } }) => {
			const userIds = membersOfDeleted.get(organization.id) ?? [];
			membersOfDeleted.delete(organization.id);
			await endAccountsWithoutOffice(userIds);
		},
		afterRemoveMember: async ({ user }: { user: { id: string } }) => {
			await endAccountsWithoutOffice([user.id]);
		},
		afterLeave: async (userId: string) => {
			await endAccountsWithoutOffice([userId]);
		},
	};
}
