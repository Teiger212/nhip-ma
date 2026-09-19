import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { scheduleMissingTranslations } from "@inbox/lib/translate";
import { OperatorLanguage } from "@inbox/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * `?locale=` is the operator's language. Any guest message that lacks a translation into
 * it is translated in the background (ADR 0007); the list returned now is what exists now.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) {
		return gate.denied;
	}
	const runtime = getRuntime();
	const conversations = await runtime.store.listConversations(gate.viewer);
	const locale = OperatorLanguage.safeParse(new URL(request.url).searchParams.get("locale"));
	if (locale.success) {
		scheduleMissingTranslations(runtime, conversations, locale.data);
	}
	return NextResponse.json(conversations);
}
