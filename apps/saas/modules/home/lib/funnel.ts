import "server-only";
import { getSession } from "@auth/lib/server";
import { refreshCrm } from "@inbox/lib/crm/sync";
import { resolveOffice } from "@inbox/lib/office";
import { getRuntime } from "@inbox/lib/runtime";
import type { Funnel } from "@repo/database/inbox";

/** Home's window (ADR 0002): one fixed period until an office asks for a picker. */
export const FUNNEL_WINDOW_DAYS = 30;

/** How long Home waits on the CRM before counting what is cached (ADR 0003). */
const CRM_WAIT_MS = 3000;

export type HomeFunnel =
	| {
			funnel: Funnel;
			/** The CRM failed or did not answer in time; closings and lost are the cached ones. */
			crmStale: boolean;
			denied?: undefined;
	  }
	| { funnel?: undefined; crmStale?: undefined; denied: "no_office" | "ambiguous_office" };

/**
 * The office funnel for the signed-in operator, resolved the way the API gate resolves it
 * (membership, never the session's active organization) and counted inside the store.
 * The `(authenticated)` layout has already sent a visitor without a session to login.
 */
export async function loadHomeFunnel(): Promise<HomeFunnel> {
	const session = await getSession();
	if (!session) {
		return { denied: "no_office" };
	}
	const office = await resolveOffice(session.user.id);
	if (office.denied) {
		return { denied: office.denied };
	}
	const since = new Date(Date.now() - FUNNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
	const runtime = getRuntime();
	// Fetch on view (ADR 0003): at most CRM_WAIT_MS for the CRM, then count what is cached.
	let timer: ReturnType<typeof setTimeout> | undefined;
	const refresh = await Promise.race([
		refreshCrm(runtime, office.officeId),
		new Promise<{ status: "failed"; error: string }>((resolve) => {
			timer = setTimeout(() => resolve({ status: "failed", error: "timeout" }), CRM_WAIT_MS);
		}),
	]);
	clearTimeout(timer);
	const funnel = await runtime.store.funnel(
		{ userId: session.user.id, officeId: office.officeId },
		{ since, countMock: runtime.config.sendMode !== "live" },
	);
	return { funnel, crmStale: refresh.status === "failed" };
}
