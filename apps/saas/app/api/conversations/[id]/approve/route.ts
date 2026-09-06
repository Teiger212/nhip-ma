import { approveAndSend } from "@inbox/lib/inbox";
import { requireInboxSession } from "@inbox/lib/require-session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const denied = await requireInboxSession(request);
	if (denied) {
		return denied;
	}
	const { id } = await context.params;
	let reply: string | undefined;
	try {
		const body = (await request.json()) as { reply?: unknown };
		if (typeof body.reply === "string") {
			reply = body.reply;
		}
	} catch {
		reply = undefined;
	}
	const result = await approveAndSend(decodeURIComponent(id), reply);
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
