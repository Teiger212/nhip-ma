import { scheduleMissingLeadAddress, scheduleMissingLeadRetry } from "@inbox/lib/inbox";
import { draftOnOpen } from "@inbox/lib/model-draft";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { scheduleMissingTranslations } from "@inbox/lib/translate";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * One thread, whole. Any guest message on it that lacks a translation into the office language
 * is translated in the background (ADR 0007, ADR 0025); the office language is read here, never
 * taken from the client, so a `?locale=` is ignored, and it comes back with the thread
 * (`officeLanguage`), so the open thread shows translations in it as of this read. A thread of an office
 * with a CRM and no lead yet tries its lead write again in the background, once its wait is over
 * (#211); a linked one whose lead has no address in the CRM's web app yet asks the CRM which
 * account the office is on (CRM 10). A guest message still waiting for the model's draft is
 * drafted now rather than when its wait is over (ADR 0024, `draftOnOpen`). The thread returned
 * now is what exists now.
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
	const officeLanguage = await runtime.store.officeLanguage(conv.officeId);
	scheduleMissingTranslations(runtime, conv, officeLanguage);
	scheduleMissingLeadRetry(runtime, conv);
	scheduleMissingLeadAddress(runtime, conv);
	draftOnOpen(runtime, conv);
	return NextResponse.json({ ...conv, officeLanguage });
}
