import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

import { resolveOffice } from "./office";
import type { InboxViewer } from "./types";

type SessionGate =
	| { denied: Response; viewer?: undefined; session?: undefined }
	| {
			denied?: undefined;
			viewer: InboxViewer;
			/** The sign-in itself, for what belongs to it (its devices, #134) and the language. */
			session: { id: string; locale: string | null; impersonated: boolean };
	  };

const DENIALS = {
	no_office: "This account does not belong to an office yet.",
	ambiguous_office: "This account belongs to more than one office. Ask Nhịp to fix it.",
	platform_admin: "The platform admin works in the admin area, not in an office's inbox.",
} as const;

/**
 * Inbox route handlers live outside the `(authenticated)` layout and outside oRPC,
 * so they must check the Better Auth session themselves. Returns a 401 response
 * when there is no session, a 403 when the operator belongs to no office or to more
 * than one (`resolveOffice`), otherwise the viewer to scope reads and writes with.
 */
export async function requireInboxSession(request: Request): Promise<SessionGate> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return { denied: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
	}
	const office = await resolveOffice(session.user);
	if (office.denied) {
		return {
			denied: NextResponse.json(
				{ error: office.denied, message: DENIALS[office.denied] },
				{ status: 403 },
			),
		};
	}
	return {
		viewer: { userId: session.user.id, officeId: office.officeId, role: office.role },
		session: {
			id: session.session.id,
			locale: session.user.locale ?? null,
			impersonated: Boolean(session.session.impersonatedBy),
		},
	};
}
