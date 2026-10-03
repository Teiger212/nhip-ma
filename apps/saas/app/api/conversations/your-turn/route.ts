import { yourTurnCount } from "@inbox/lib/queue";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * How many threads this operator can open are Your turn, for the nav on every page. The
 * same visibility and the same rule as the inbox (ADR 0004, ADR 0015): the store reads the
 * thread summaries, the queue rule counts them, and only the number leaves the server.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const summaries = await getRuntime().store.listConversationSummaries(gate.viewer);
	return NextResponse.json({ count: yourTurnCount(summaries) });
}
