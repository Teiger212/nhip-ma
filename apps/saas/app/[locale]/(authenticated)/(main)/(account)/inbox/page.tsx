import { getSession } from "@auth/lib/server";
import { Inbox } from "@inbox/components/Inbox";
import { type AlertLinkTarget, resolveAlertLink } from "@inbox/lib/guest-alerts/alert-link";
import { resolveOffice } from "@inbox/lib/office";
import { getRuntime } from "@inbox/lib/runtime";
import { sendPlatformAdminToAdminArea } from "@shared/lib/platform-admin";
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
	await sendPlatformAdminToAdminArea();
	const { alert } = await searchParams;
	const alertId = typeof alert === "string" ? alert : null;
	const alertLink = alertId === null ? undefined : await openAlert(alertId);
	// A new alert link opens a fresh Inbox, whatever the last one had open.
	return <Inbox key={alertId ?? ""} alertLink={alertLink} />;
}
