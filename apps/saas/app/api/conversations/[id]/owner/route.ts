import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const body = z.object({ ownerId: z.string().min(1).nullable() });

/**
 * A manager gives a thread to an operator of the office, or back to Unassigned (ADR 0022).
 * Agents cannot reassign (403); the new owner must be a member of the thread's office.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") {
		return NextResponse.json(
			{ error: "forbidden", message: "Only a manager reassigns threads." },
			{ status: 403 },
		);
	}
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const { id } = await context.params;
	const { store } = getRuntime();
	const conv = await store.getConversation(decodeURIComponent(id), gate.viewer);
	if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
	const moved = await store.setOwner(conv.id, parsed.data.ownerId, gate.viewer.officeId);
	if (!moved) {
		return NextResponse.json(
			{ error: "not_a_member", message: "That person is not an agent of this office." },
			{ status: 400 },
		);
	}
	return NextResponse.json(await store.getConversation(conv.id, gate.viewer));
}
