import { auth } from "@repo/auth";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { NextResponse } from "next/server";

/** Pipe connections are the platform admin's (ADR 0017): 401 signed out, 403 anyone else. */
export async function requirePlatformAdmin(
	request: Request,
): Promise<{ denied: Response; userId?: undefined } | { denied?: undefined; userId: string }> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return { denied: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
	}
	if (!isPlatformAdmin(session.user.role)) {
		return { denied: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
	}
	return { userId: session.user.id };
}
