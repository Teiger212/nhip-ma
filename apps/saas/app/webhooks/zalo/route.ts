import { handleInboundWebhook } from "@inbox/lib/pipes/webhook";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	return new NextResponse("ok", { status: 200 });
}

export function POST(request: Request): Promise<Response> {
	return handleInboundWebhook("zalo", request);
}
