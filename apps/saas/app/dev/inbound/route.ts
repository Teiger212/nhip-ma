import { isDevInboundEnabled } from "@inbox/lib/dev";
import { injectDevInbound } from "@inbox/lib/inbox";
import type { Pipe } from "@inbox/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	if (!isDevInboundEnabled()) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	const body = (await request.json().catch(() => ({}))) as {
		pipe?: unknown;
		guestId?: unknown;
		text?: unknown;
		guestName?: unknown;
		vendorMessageId?: unknown;
		at?: unknown;
	};
	const pipe: Pipe | null =
		body.pipe === "zalo" ? "zalo" : body.pipe === "whatsapp" ? "whatsapp" : null;
	const guestId = typeof body.guestId === "string" ? body.guestId.trim() : "";
	const text = typeof body.text === "string" ? body.text.trim() : "";
	if (!pipe || !guestId || !text) {
		return NextResponse.json(
			{
				error: "bad_request",
				message: "pipe (zalo|whatsapp), guestId, and text are required",
			},
			{ status: 400 },
		);
	}
	const conversation = await injectDevInbound({
		pipe,
		guestId,
		text,
		guestName: typeof body.guestName === "string" ? body.guestName : null,
		vendorMessageId: typeof body.vendorMessageId === "string" ? body.vendorMessageId : null,
		at: typeof body.at === "number" || typeof body.at === "string" ? body.at : Date.now(),
	});
	return NextResponse.json({ ok: true, conversation });
}
