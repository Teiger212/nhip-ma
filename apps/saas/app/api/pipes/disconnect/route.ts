import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { Pipe } from "@inbox/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({ officeId: z.string().min(1), pipe: Pipe, externalId: z.string().min(1) });

/**
 * The platform admin ends an office's hold on an endpoint (ADR 0017): its tokens go, new
 * guest messages there no longer reach the office, and its threads stay.
 */
export async function POST(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const { store } = getRuntime();
	const holder = await store.officeForPipe(parsed.data.pipe, parsed.data.externalId);
	if (holder !== parsed.data.officeId) {
		return NextResponse.json({ error: "not_connected" }, { status: 404 });
	}
	await store.releasePipe(parsed.data.pipe, parsed.data.externalId);
	return NextResponse.json({ ok: true });
}
