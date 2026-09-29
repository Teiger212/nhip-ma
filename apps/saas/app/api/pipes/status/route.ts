import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The operator's office's disconnected pipes, for the inbox's banner (ADR 0017). Only the
 * pipe and that it is disconnected: endpoint ids and reasons are the platform admin's.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const pipes = await getRuntime().store.officePipes(gate.viewer.officeId);
	const disconnected = [
		...new Set(pipes.filter((p) => p.credential === "disconnected").map((p) => p.pipe)),
	];
	return NextResponse.json({ disconnected });
}
