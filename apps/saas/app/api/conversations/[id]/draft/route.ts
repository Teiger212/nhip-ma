import { regenerateDraft } from "@inbox/lib/inbox";
import { requireInboxSession } from "@inbox/lib/require-session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** A new suggested reply for the unanswered inbound (ADR 0005). Never sends. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) {
		return gate.denied;
	}
	const { id } = await context.params;
	const result = await regenerateDraft(decodeURIComponent(id), gate.viewer);
	if (!result.ok) {
		return NextResponse.json(
			{ error: result.error, message: result.message },
			{ status: result.status },
		);
	}
	return NextResponse.json({ ok: true, conversation: result.conversation });
}
