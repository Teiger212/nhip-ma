import "server-only";
import { getSession } from "@auth/lib/server";
import { resolveOffice } from "@inbox/lib/office";
import { getRuntime } from "@inbox/lib/runtime";
import type { Funnel } from "@repo/database/inbox";

/** Home's window (ADR 0002): one fixed period until an office asks for a picker. */
export const FUNNEL_WINDOW_DAYS = 30;

export type HomeFunnel =
	| { funnel: Funnel; denied?: undefined }
	| { funnel?: undefined; denied: "no_office" | "ambiguous_office" };

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
	const funnel = await getRuntime().store.funnel(
		{ userId: session.user.id, officeId: office.officeId },
		{ since },
	);
	return { funnel };
}
