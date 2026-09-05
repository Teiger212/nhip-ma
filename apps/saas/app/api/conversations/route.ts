import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	return NextResponse.json(await getRuntime().store.listConversations());
}
