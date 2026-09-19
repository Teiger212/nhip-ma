import { auth } from "@repo/auth";
import { getFirstOrganizationMembershipForUser } from "@repo/database";
import { NextResponse } from "next/server";

import type { InboxViewer } from "./types";

type SessionGate =
	| { denied: Response; viewer?: undefined }
	| { denied?: undefined; viewer: InboxViewer };

/**
 * Inbox route handlers live outside the `(authenticated)` layout and outside oRPC,
 * so they must check the Better Auth session themselves. Returns a 401 response
 * when there is no session, a 403 when the operator belongs to no office, otherwise
 * the viewer to scope reads and writes with.
 *
 * The office (ADR 0008) is the kit organization. The session's active organization
 * wins; an operator who never picked one (the switcher is hidden while one agency is one
 * office) acts for the first office they are a member of.
 */
export async function requireInboxSession(request: Request): Promise<SessionGate> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return { denied: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
	}
	const officeId =
		session.session.activeOrganizationId ??
		(await getFirstOrganizationMembershipForUser(session.user.id))?.organizationId ??
		null;
	if (!officeId) {
		return {
			denied: NextResponse.json(
				{ error: "no_office", message: "This account does not belong to an office yet." },
				{ status: 403 },
			),
		};
	}
	return { viewer: { userId: session.user.id, officeId } };
}
