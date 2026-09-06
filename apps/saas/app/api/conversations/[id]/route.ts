import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
	const denied = await requireInboxSession(request);
	if (denied) {
		return denied;
	}
	const { id } = await context.params;
	const conv = await getRuntime().store.getConversation(decodeURIComponent(id));
	if (!conv) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	return NextResponse.json(conv);
}
