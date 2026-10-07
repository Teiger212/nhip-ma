import "server-only";
import { getSession } from "@auth/lib/server";
import { OFFICE_TIME_ZONE, windowStart } from "@home/lib/window";
import { type OfficeDenial, resolveOffice } from "@inbox/lib/office";
import { getRuntime } from "@inbox/lib/runtime";
import type { CrmOutcomeCounts, Funnel } from "@repo/database/inbox";

/** Home's window (ADR 0002): one fixed period until an office asks for a picker. */
export const FUNNEL_WINDOW_DAYS = 30;

export type HomeFunnel =
	| { funnel: Funnel; crm: CrmOutcomeCounts | null; denied?: undefined }
	| { funnel?: undefined; crm?: undefined; denied: OfficeDenial };

/**
 * The office funnel for the signed-in operator, resolved the way the API gate resolves it
 * (membership, never the session's active organization) and counted inside the store.
 * Closings and Lost come from the outcomes Nhịp cached from the office's CRM (null: it has
 * none); Home never asks the CRM, so it loads at once whatever the CRM is doing (ADR 0003, #68).
 * The `(authenticated)` layout has already sent a visitor without a session to login.
 */
export async function loadHomeFunnel(): Promise<HomeFunnel> {
	const session = await getSession();
	if (!session) {
		return { denied: "no_office" };
	}
	const office = await resolveOffice(session.user);
	if (office.denied) {
		return { denied: office.denied };
	}
	const since = windowStart(new Date(), FUNNEL_WINDOW_DAYS, OFFICE_TIME_ZONE);
	const runtime = getRuntime();
	const viewer = { userId: session.user.id, officeId: office.officeId };
	const [funnel, crm] = await Promise.all([
		runtime.store.funnel(viewer, {
			since,
			countMock: runtime.config.sendMode !== "live",
			timeZone: OFFICE_TIME_ZONE,
		}),
		runtime.store.crmOutcomes(viewer, { since }),
	]);
	return { funnel, crm };
}
