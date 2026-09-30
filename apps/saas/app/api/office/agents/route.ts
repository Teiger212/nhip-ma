import { requireInboxSession } from "@inbox/lib/require-session";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { db } from "@repo/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The office's operators a manager can give a thread to (ADR 0015): its members, without the
 * platform admin's inert membership. Managers only.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}
	const members = await db.member.findMany({
		where: { organizationId: gate.viewer.officeId },
		select: { role: true, user: { select: { id: true, name: true, email: true, role: true } } },
		orderBy: { createdAt: "asc" },
	});
	return NextResponse.json(
		members
			.filter((member) => !isPlatformAdmin(member.user.role))
			.map((member) => ({
				id: member.user.id,
				name: member.user.name || member.user.email,
				manager: member.role === "owner" || member.role === "admin",
			})),
	);
}
