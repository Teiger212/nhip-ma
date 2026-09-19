import { NextResponse } from "next/server";

import { ingestEvents } from "../inbox";
import { getRuntime } from "../runtime";
import type { Pipe } from "../types";
import { pipeAdapter } from "./index";

/**
 * The one inbound path. A webhook route only says which pipe it is; verification,
 * parsing and ingestion happen here through that pipe's adapter.
 */
export async function handleInboundWebhook(pipe: Pipe, request: Request): Promise<Response> {
	const runtime = getRuntime();
	const { config } = runtime;
	const adapter = pipeAdapter(pipe);
	const raw = await request.text();
	if (!adapter.verifyInbound(raw, request.headers, config)) {
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
	await ingestEvents(runtime, adapter.parseInbound(body), config.webhookOwnerUserId);
	return NextResponse.json({ ok: true });
}
