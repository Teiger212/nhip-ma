import { errorKind } from "@shared/lib/scrub";
import { NextResponse } from "next/server";

import { ingestEvents, type IngestSummary } from "../inbox";
import { getRuntime, type Runtime } from "../runtime";
import type { Pipe } from "../types";
import { pipeAdapter } from "./index";

/** How long the delivery log keeps a webhook (ADR 0017). */
export const DELIVERY_RETENTION_DAYS = 30;

/**
 * The one inbound path. A webhook route only says which pipe it is; verification,
 * parsing and ingestion happen here through that pipe's adapter. Every request is put on
 * the delivery log, whatever became of it.
 */
export async function handleInboundWebhook(pipe: Pipe, request: Request): Promise<Response> {
	const runtime = getRuntime();
	const { config } = runtime;
	const adapter = pipeAdapter(pipe);
	const raw = await request.text();
	if (!adapter.verifyInbound(raw, request.headers, config)) {
		await logDelivery(runtime, pipe, "refused");
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
	let summary: IngestSummary;
	try {
		summary = await ingestEvents(runtime, adapter.parseInbound(body));
	} catch (err) {
		await logDelivery(runtime, pipe, "failed", undefined, err);
		// The vendor retries on a 5xx; the retry is logged as its own delivery.
		throw err;
	}
	await logDelivery(runtime, pipe, "processed", summary);
	return NextResponse.json({ ok: true });
}

/** Best effort: a log that cannot be written never costs a guest's message. */
async function logDelivery(
	runtime: Runtime,
	pipe: Pipe,
	outcome: "refused" | "processed" | "failed",
	summary?: IngestSummary,
	error?: unknown,
): Promise<void> {
	const filed = summary?.filed ?? [];
	const dropped = summary?.dropped ?? [];
	const unique = (values: (string | null)[]) => [
		...new Set(values.filter((v): v is string => Boolean(v))),
	];
	try {
		await runtime.store.recordWebhookDelivery({
			pipe,
			outcome,
			endpoints: unique([...filed.map((m) => m.endpoint), ...dropped.map((m) => m.endpoint)]),
			officeIds: unique(filed.map((m) => m.officeId)),
			filed: filed.length,
			dropped: dropped.length,
			vendorMessageIds: unique([...filed, ...dropped].map((m) => m.vendorMessageId)),
			errorKind: error instanceof Error ? error.name : error ? "unknown" : null,
		});
		// Retention without a scheduler: about one delivery in a hundred prunes the old ones.
		if (Math.random() < 0.01) {
			await runtime.store.pruneWebhookDeliveries(
				new Date(Date.now() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000),
			);
		}
	} catch (logError) {
		// The kind only (#220): a database error quotes the row it refused, vendor ids included.
		console.error("[webhooks] could not record a delivery", { kind: errorKind(logError) });
	}
}
