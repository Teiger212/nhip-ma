import { getSession } from "@auth/lib/server";
import { Inbox } from "@inbox/components/Inbox";
import { type AlertLinkTarget, resolveAlertLink } from "@inbox/lib/guest-alerts/alert-link";
import { resolveOffice } from "@inbox/lib/office";
import { prefetchInbox } from "@inbox/lib/prefetch-inbox";
import { getRuntime } from "@inbox/lib/runtime";
import { requireSession } from "@organizations/lib/require-session";
import { sendPlatformAdminToAdminArea } from "@shared/lib/platform-admin";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");
	return {
		title: t("inbox"),
	};
}

/**
 * `?alert=<id>`, an alert's link, is resolved here for the signed-in operator alone (ADR 0019,
 * #136): the thread it opens goes to the Inbox as a prop, never into the URL.
 */
async function openAlert(alertId: string): Promise<AlertLinkTarget> {
	const session = await getSession();
	if (!session) return { threadId: null };
	const office = await resolveOffice(session.user);
	if (office.denied) return { threadId: null };
	return resolveAlertLink(
		getRuntime().store,
		{ userId: session.user.id, officeId: office.officeId, role: office.role },
		alertId,
	);
}

export default async function InboxPage({
	searchParams,
}: {
	searchParams: Promise<{ alert?: string | string[] }>;
}) {
	// Signed in, checked here and not only by the layout (#231), before an alert is resolved.
	await requireSession();
	await sendPlatformAdminToAdminArea();
	const { alert } = await searchParams;
	const alertId = typeof alert === "string" ? alert : null;
	const alertLink = alertId === null ? undefined : await openAlert(alertId);
	// The thread list and the operator's role arrive with the page, not after first paint; the
	// client keeps polling the list as before.
	const queryClient = getServerQueryClient();
	await prefetchInbox(queryClient);
	// A new alert link opens a fresh Inbox, whatever the last one had open.
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<Inbox key={alertId ?? ""} alertLink={alertLink} />
		</HydrationBoundary>
	);
}
