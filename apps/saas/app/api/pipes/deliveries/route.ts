import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { Pipe } from "@inbox/lib/types";
import { db } from "@repo/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The delivery log (ADR 0017), newest first, with the offices' names. Platform admin only. */
export async function GET(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const pipe = Pipe.safeParse(new URL(request.url).searchParams.get("pipe"));
	const deliveries = await getRuntime().store.listWebhookDeliveries({
		limit: 100,
		pipe: pipe.success ? pipe.data : undefined,
	});
	const officeIds = [...new Set(deliveries.flatMap((d) => d.officeIds))];
	const offices = await db.organization.findMany({
		where: { id: { in: officeIds } },
		select: { id: true, name: true },
	});
	return NextResponse.json({
		deliveries,
		offices: Object.fromEntries(offices.map((o) => [o.id, o.name])),
	});
}
