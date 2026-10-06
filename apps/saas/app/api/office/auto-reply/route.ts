import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({ on: z.boolean() });

function forbidden(): Response {
	return NextResponse.json(
		{ error: "forbidden", message: "Only a manager sets the office's auto-reply." },
		{ status: 403 },
	);
}

/**
 * The office's auto-reply switch (ADR 0021 G6, #167), for its managers only: an agent gets 403,
 * a signed-out caller 401. Like every `/api/` route, it sits under the platform's rate limit
 * (the Vercel Firewall rule, AGENTS.md); there is no per-route limiter.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") return forbidden();
	const office = await getRuntime().store.officeAutoReply(gate.viewer.officeId);
	if (!office) return NextResponse.json({ error: "not_found" }, { status: 404 });
	return NextResponse.json({ on: office.on });
}

/**
 * A manager turns it on or off. Turning it on from off greets only threads that begin
 * afterwards (S1).
 */
export async function PUT(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") return forbidden();
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	await getRuntime().store.setOfficeAutoReply(gate.viewer.officeId, parsed.data.on);
	return NextResponse.json({ on: parsed.data.on });
}
