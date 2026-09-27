import { searchCrmLeads } from "@inbox/lib/crm/link";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** `?q=` searches the office's CRM for the "link to CRM lead" picker (ADR 0003). */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
	const result = await searchCrmLeads(getRuntime(), gate.viewer, query);
	return result.ok
		? NextResponse.json({ leads: result.leads })
		: NextResponse.json({ error: result.error }, { status: result.status });
}
