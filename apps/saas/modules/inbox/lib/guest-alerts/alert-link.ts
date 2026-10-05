import type { InboxViewer, Store } from "../types";

/** What an alert's link opens for this viewer: the thread, or nothing of one (the notice). */
export type AlertLinkTarget = { threadId: string } | { threadId: null };

/**
 * `/<locale>/inbox?alert=<id>`, resolved on the server for the viewer alone (ADR 0019, #136).
 * The viewer's own alert on a thread they can open now selects it; anything else (a
 * colleague's alert, a thread since given to someone else, an unknown or pruned id, a test
 * alert) is the same answer, "A colleague is answering this guest", with no reason attached,
 * so the link tells no one anything about a thread. Visibility, not ownership, decides: a
 * manager's own alert still opens a thread they gave an agent (ADR 0022).
 */
export async function resolveAlertLink(
	store: Store,
	viewer: InboxViewer,
	alertId: string,
): Promise<AlertLinkTarget> {
	if (!alertId) return { threadId: null };
	return { threadId: await store.alertThread(alertId, viewer) };
}
