import type {
	GuestDeletionReason,
	GuestDeletionResult,
	InboxStore,
	InboxViewer,
} from "@repo/database/inbox";

/**
 * The guest-deletion module (ADR 0020): the deletion route's only caller, like the CRM sync
 * module. It deletes the guest in Nhịp under the deployment's `countMock` (the flag Home reads
 * the funnel with), as the manager. The CRM checkbox (`deleteInCrm`) arrives with #139; until
 * then a thread's lead is only unlinked, which the cascade does.
 */
export function createGuestDeletion(deps: { store: InboxStore; countMock: boolean }) {
	return {
		async deleteGuest(
			viewer: InboxViewer,
			conversationId: string,
			choice: { deleteInCrm: boolean; reason: GuestDeletionReason; note: string | null },
		): Promise<GuestDeletionResult> {
			return deps.store.deleteGuest(viewer.officeId, conversationId, {
				countMock: deps.countMock,
				actorId: viewer.userId,
				reason: choice.reason,
				note: choice.note,
			});
		},
	};
}
