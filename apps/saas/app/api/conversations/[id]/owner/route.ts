import { scheduleOwnerChangeAlert } from "@inbox/lib/guest-alerts/owner-change";
import { refreshTemplate } from "@inbox/lib/inbox";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const body = z.object({ ownerId: z.string().min(1).nullable() });

/**
 * A manager gives a thread to an operator of the office, or back to Unassigned (ADR 0022).
 * Agents cannot reassign (403); the new owner must be a member of the thread's office. Once
 * moved, the change's alerts and bell rows run in the background (#133): they never hold up the
 * answer, and a failure never undoes the change. An untouched template suggested reply is written
 * again in the new owner's name before the answer (ADR 0024); a failure there is logged and leaves
 * the change.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") {
		return NextResponse.json(
			{ error: "forbidden", message: "Only a manager reassigns conversations." },
			{ status: 403 },
		);
	}
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const { id } = await context.params;
	const runtime = getRuntime();
	const { store } = runtime;
	const conv = await store.getConversation(decodeURIComponent(id), gate.viewer);
	if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
	const moved = await store.reassign(conv.id, parsed.data.ownerId, gate.viewer.officeId);
	if (!moved) {
		return NextResponse.json(
			{ error: "not_a_member", message: "That person is not an agent of this office." },
			{ status: 400 },
		);
	}
	try {
		const reassigned = await store.getOfficeConversation(conv.officeId, conv.id);
		if (reassigned) await refreshTemplate(store, reassigned);
	} catch (error) {
		console.warn("inbox: template rewrite after reassign failed", {
			kind: error instanceof Error ? error.name : "unknown",
		});
	}
	scheduleOwnerChangeAlert(runtime, conv, {
		previousOwnerId: moved.previousOwnerId,
		newOwnerId: parsed.data.ownerId,
		actorId: gate.viewer.userId,
	});
	return NextResponse.json(await store.getConversation(conv.id, gate.viewer));
}
