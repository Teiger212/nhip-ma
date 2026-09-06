import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

import type { InboxViewer } from "./types";

type SessionGate =
	| { denied: Response; viewer?: undefined }
	| { denied?: undefined; viewer: InboxViewer };

/**
 * Inbox route handlers live outside the `(authenticated)` layout and outside oRPC,
 * so they must check the Better Auth session themselves. Returns a 401 response
 * when there is no session, otherwise the viewer to scope reads and writes with.
 */
export async function requireInboxSession(request: Request): Promise<SessionGate> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return { denied: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
	}
	return { viewer: { userId: session.user.id } };
}
