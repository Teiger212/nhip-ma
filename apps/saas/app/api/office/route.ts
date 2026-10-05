import { requireInboxSession } from "@inbox/lib/require-session";
import { db } from "@repo/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The signed-in operator's role in their office (ADR 0015): what the inbox offers them. The
 * office's slug addresses its pages, such as Team (#82).
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const office = await db.organization.findUnique({
		where: { id: gate.viewer.officeId },
		select: { slug: true },
	});
	return NextResponse.json({
		userId: gate.viewer.userId,
		role: gate.viewer.role ?? "agent",
		officeSlug: office?.slug ?? null,
	});
}
