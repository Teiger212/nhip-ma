import { auth } from "@repo/auth";
import { getOrganizationMembershipsForUser } from "@repo/database";
import { NextResponse } from "next/server";

import type { InboxViewer } from "./types";

type SessionGate =
	| { denied: Response; viewer?: undefined }
	| { denied?: undefined; viewer: InboxViewer };

/**
 * Inbox route handlers live outside the `(authenticated)` layout and outside oRPC,
 * so they must check the Better Auth session themselves. Returns a 401 response
 * when there is no session, a 403 when the operator belongs to no office or to more
 * than one, otherwise the viewer to scope reads and writes with.
 *
 * The office (ADR 0008) is the kit organization, and one operator belongs to exactly one
 * (ADR 0010). It is read from the membership table on every request. The session's
 * "active organization" is never consulted: it is a client-writable preference, and a
 * preference cannot grant access.
 */
export async function requireInboxSession(request: Request): Promise<SessionGate> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return { denied: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
	}
	const memberships = await getOrganizationMembershipsForUser(session.user.id);
	if (memberships.length === 0) {
		return {
			denied: NextResponse.json(
				{ error: "no_office", message: "This account does not belong to an office yet." },
				{ status: 403 },
			),
		};
	}
	if (memberships.length > 1) {
		console.warn("inbox: operator belongs to more than one office; refusing", {
			userId: session.user.id,
			offices: memberships.map((membership) => membership.organizationId),
		});
		return {
			denied: NextResponse.json(
				{
					error: "ambiguous_office",
					message: "This account belongs to more than one office. Ask Nhịp to fix it.",
				},
				{ status: 403 },
			),
		};
	}
	return { viewer: { userId: session.user.id, officeId: memberships[0].organizationId } };
}
