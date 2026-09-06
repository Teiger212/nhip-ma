import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const denied = await requireInboxSession(request);
	if (denied) {
		return denied;
	}
	return NextResponse.json(await getRuntime().store.listConversations());
}
