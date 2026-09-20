import { approveAndSend } from "@inbox/lib/inbox";
import { requireInboxSession } from "@inbox/lib/require-session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Approve and send. The body names the guest message being answered and the exact text;
 * a missing target, a stale target, or an empty reply is refused (ADR 0011).
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) {
		return gate.denied;
	}
	const { id } = await context.params;
	let inboundId: string | undefined;
	let text: string | undefined;
	try {
		const body = (await request.json()) as { inboundId?: unknown; reply?: unknown };
		if (typeof body.inboundId === "string") {
			inboundId = body.inboundId;
		}
		if (typeof body.reply === "string") {
			text = body.reply;
		}
	} catch {
		// A malformed body is an approval of nothing; the checks below refuse it.
	}
	const result = await approveAndSend(decodeURIComponent(id), { inboundId, text }, gate.viewer);
	if (!result.ok) {
		if (result.detail) {
			// Vendor error bodies stay in server logs; they are never echoed to the caller.
			console.error("inbox approve send failed", {
				id,
				error: result.error,
				detail: result.detail,
			});
		}
		return NextResponse.json(
			{ error: result.error, message: result.message },
			{ status: result.status },
		);
	}
	return NextResponse.json({ ok: true, conversation: result.conversation });
}
