import { type LinkResult, linkCrmLead, unlinkCrmLead } from "@inbox/lib/crm/link";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function respond(result: LinkResult): Response {
	return result.ok
		? NextResponse.json({ conversation: result.conversation })
		: NextResponse.json({ error: result.error }, { status: result.status });
}

/** Link the thread to a CRM lead the agent picked (ADR 0003). Body: `{ leadId }`. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const { id } = await context.params;
	let leadId: string | undefined;
	try {
		const body = (await request.json()) as { leadId?: unknown };
		if (typeof body.leadId === "string" && body.leadId.trim()) leadId = body.leadId;
	} catch {
		// A malformed body links nothing; refused below.
	}
	if (!leadId) return NextResponse.json({ error: "lead_required" }, { status: 400 });
	return respond(await linkCrmLead(getRuntime(), gate.viewer, decodeURIComponent(id), leadId));
}

/** Unlink; remembered as the agent's choice so phone matching never relinks it. */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const { id } = await context.params;
	return respond(await unlinkCrmLead(getRuntime(), gate.viewer, decodeURIComponent(id)));
}
