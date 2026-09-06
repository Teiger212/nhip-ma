import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * Inbox route handlers live outside the `(authenticated)` layout and outside oRPC,
 * so they must check the Better Auth session themselves. Returns a 401 response
 * when there is no session, otherwise null.
 */
export async function requireInboxSession(request: Request): Promise<Response | null> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	return null;
}
