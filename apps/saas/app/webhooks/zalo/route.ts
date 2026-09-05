import { ingestEvents } from "@inbox/lib/inbox";
import { parseZaloWebhook } from "@inbox/lib/pipes";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const challenge = url.searchParams.get("challenge");
	if (challenge) {
		return new NextResponse(challenge, { status: 200 });
	}
	return new NextResponse("ok", { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
	const { store } = getRuntime();
	const raw = await request.text();
	let body: unknown = {};
	if (raw) {
		try {
			body = JSON.parse(raw) as unknown;
		} catch {
			body = {};
		}
	}
	await ingestEvents(store, parseZaloWebhook(body));
	return NextResponse.json({ ok: true });
}
