import "server-only";
import type { QueryClient } from "@tanstack/react-query";

import { conversationListQueryKey, officeQueryKey } from "./inbox-query-keys";
import { resolveOffice } from "./office";
import { readOfficeViewer } from "./office-viewer";
import { getRuntime } from "./runtime";

/**
 * Puts the thread list and the operator's office role in the query cache on the server, so the
 * Inbox paints with both. The authenticated layout calls it before it dehydrates: the app shell's
 * own observers (nav count, user menu) create these cache entries during render, before any
 * page-level boundary could hydrate them. It reads through the same calls as `/api/conversations` and
 * `/api/office`, for the same viewer (an agent's own threads, a manager's all of the office's),
 * and does nothing for an operator the inbox refuses: the client then asks and gets the 403
 * as before.
 */
export async function prefetchInbox(
	queryClient: QueryClient,
	user: { id: string; role?: string | null },
): Promise<void> {
	const office = await resolveOffice(user);
	if (office.denied) return;
	const viewer = { userId: user.id, officeId: office.officeId, role: office.role };
	await Promise.all([
		queryClient.prefetchQuery({
			queryKey: conversationListQueryKey,
			queryFn: () => getRuntime().store.listConversationSummaries(viewer),
		}),
		queryClient.prefetchQuery({
			queryKey: officeQueryKey,
			queryFn: () => readOfficeViewer(viewer),
		}),
	]);
}
