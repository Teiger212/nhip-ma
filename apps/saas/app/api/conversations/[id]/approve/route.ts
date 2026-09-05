import { approveAndSend } from "@inbox/lib/inbox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
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
		return NextResponse.json(
			{
				error: result.error,
				message: result.message,
				detail: result.detail ?? null,
			},
			{ status: result.status },
		);
	}
	return NextResponse.json({ ok: true, conversation: result.conversation });
}
