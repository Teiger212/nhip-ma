import { ingestEvents } from "@inbox/lib/inbox";
import { parseZaloWebhook, verifyZaloSignature } from "@inbox/lib/pipes";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	return new NextResponse("ok", { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
	const { store, env } = getRuntime();
	const raw = await request.text();
	const ok = verifyZaloSignature(
		raw,
		request.headers.get("x-zevent-signature"),
		env.ZALO_OA_SECRET_KEY,
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
	await ingestEvents(store, parseZaloWebhook(body), env.INBOX_OWNER_USER_ID || null);
	return NextResponse.json({ ok: true });
}
