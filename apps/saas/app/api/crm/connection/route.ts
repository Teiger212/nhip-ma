import { createCrmSync } from "@inbox/lib/crm/sync";
import { threadUrl } from "@inbox/lib/inbox";
import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { CrmKind } from "@inbox/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({ officeId: z.string().min(1), kind: CrmKind.nullable() });

/** The office's CRM as the platform admin sees it (Admin → the office → Connections, ADR 0003). */
export async function GET(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const officeId = new URL(request.url).searchParams.get("officeId");
	if (!officeId) return NextResponse.json({ error: "office_required" }, { status: 400 });
	const { store } = getRuntime();
	if (!(await store.officeExists(officeId))) {
		return NextResponse.json({ error: "office_not_found" }, { status: 404 });
	}
	const connection = await store.getCrmConnection(officeId);
	return NextResponse.json({ kind: connection?.kind ?? null });
}

/**
 * The platform admin sets the office's CRM, or none (spec #59, Q6). New guests then become
 * leads in it; another kind, or none, drops the office's thread links.
 */
export async function PUT(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const sync = createCrmSync({ store: getRuntime().store, threadUrl });
	const found = await sync.connectOffice(parsed.data.officeId, parsed.data.kind);
	if (!found) return NextResponse.json({ error: "office_not_found" }, { status: 404 });
	return NextResponse.json({ kind: parsed.data.kind });
}
