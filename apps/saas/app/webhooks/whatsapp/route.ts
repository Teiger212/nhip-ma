import { ingestEvents } from "@inbox/lib/inbox";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@inbox/lib/pipes";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const mode = url.searchParams.get("hub.mode");
	const token = url.searchParams.get("hub.verify_token");
	const challenge = url.searchParams.get("hub.challenge");
	const expected = getRuntime().env.WHATSAPP_VERIFY_TOKEN;
	if (mode === "subscribe" && token && token === expected) {
		return new NextResponse(String(challenge || ""), { status: 200 });
	}
	return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
	const { store, env } = getRuntime();
	const raw = await request.text();
	const ok = verifyWhatsAppSignature(
		raw,
		request.headers.get("x-hub-signature-256"),
		env.WHATSAPP_APP_SECRET,
	);
	if (!ok) {
		return new NextResponse("bad signature", { status: 403 });
	}

	let body: unknown = {};
	if (raw) {
		try {
			body = JSON.parse(raw) as unknown;
		} catch {
			body = {};
		}
	}
	await ingestEvents(store, parseWhatsAppWebhook(body), env.INBOX_OWNER_USER_ID || null);
	return NextResponse.json({ ok: true });
}
