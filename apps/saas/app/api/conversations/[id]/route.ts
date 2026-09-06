import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) {
		return gate.denied;
	}
	const { id } = await context.params;
	const conv = await getRuntime().store.getConversation(decodeURIComponent(id), gate.viewer);
	if (!conv) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	return NextResponse.json(conv);
}
