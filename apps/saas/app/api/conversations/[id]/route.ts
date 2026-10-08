import { scheduleMissingLeadAddress, scheduleMissingLeadRetry } from "@inbox/lib/inbox";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { scheduleMissingTranslations } from "@inbox/lib/translate";
import { OperatorLanguage } from "@inbox/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * One thread, whole. `?locale=` is the operator's language: any guest message on it that
 * lacks a translation into it is translated in the background (ADR 0007). A thread of an office
 * with a CRM and no lead yet tries its lead write again in the background, once its wait is over
 * (#211); a linked one whose lead has no address in the CRM's web app yet asks the CRM which
 * account the office is on (CRM 10). The thread returned now is what exists now.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) {
		return gate.denied;
	}
	const { id } = await context.params;
	const runtime = getRuntime();
	const conv = await runtime.store.getConversation(decodeURIComponent(id), gate.viewer);
	if (!conv) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	const locale = OperatorLanguage.safeParse(new URL(request.url).searchParams.get("locale"));
	if (locale.success) {
		scheduleMissingTranslations(runtime, conv, locale.data);
	}
	scheduleMissingLeadRetry(runtime, conv);
	scheduleMissingLeadAddress(runtime, conv);
	return NextResponse.json(conv);
}
