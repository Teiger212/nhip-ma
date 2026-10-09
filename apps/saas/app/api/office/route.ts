import { readOfficeViewer } from "@inbox/lib/office-viewer";
import { requireInboxSession } from "@inbox/lib/require-session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The signed-in operator's role in their office (ADR 0015): what the inbox offers them. The
 * office's slug addresses its pages, such as Team (#82).
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	return NextResponse.json(await readOfficeViewer(gate.viewer));
}
