import { handleInboundWebhook } from "@inbox/lib/pipes/webhook";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A guest message's model draft waits about 30 s inside `after()`, then calls the model (20 s,
 * one retry): the function is kept alive that long (ADR 0024, #252). A literal, as Next.js reads it.
 */
export const maxDuration = 120;

export async function GET(): Promise<Response> {
	return new NextResponse("ok", { status: 200 });
}

export function POST(request: Request): Promise<Response> {
	return handleInboundWebhook("zalo", request);
}
