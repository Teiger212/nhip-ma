import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The threads this operator can open, as summaries: what the queue, search and the rows
 * read, never the messages. It is polled, so its size grows with threads only. The open
 * thread loads whole from `/api/conversations/[id]`, which is also where missing
 * translations are scheduled.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) {
		return gate.denied;
	}
	return NextResponse.json(await getRuntime().store.listConversationSummaries(gate.viewer));
}
