import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The operator's office's disconnected endpoints, for the inbox (ADR 0017): which pipe, and
 * which of the office's own numbers or OAs (threads already carry them). Reasons stay with
 * the platform admin.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const pipes = await getRuntime().store.officePipes(gate.viewer.officeId);
	const disconnected = pipes
		.filter((p) => p.credential === "disconnected")
		.map(({ pipe, externalId }) => ({ pipe, externalId }));
	return NextResponse.json({ disconnected });
}
