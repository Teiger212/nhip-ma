import { handleInboundWebhook } from "@inbox/lib/pipes/webhook";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Meta's one-time subscription handshake. */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const mode = url.searchParams.get("hub.mode");
	const token = url.searchParams.get("hub.verify_token");
	const challenge = url.searchParams.get("hub.challenge");
	const expected = getRuntime().config.whatsapp.verifyToken;
	if (mode === "subscribe" && token && token === expected) {
		return new NextResponse(String(challenge || ""), { status: 200 });
	}
	return new NextResponse("forbidden", { status: 403 });
}

export function POST(request: Request): Promise<Response> {
	return handleInboundWebhook("whatsapp", request);
}
