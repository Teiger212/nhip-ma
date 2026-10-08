import { runInBackground } from "@inbox/lib/background";
import { refreshOfficeTemplates } from "@inbox/lib/inbox";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { OperatorLanguage } from "@inbox/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({ language: OperatorLanguage });

/**
 * The office language (ADR 0025): EN or VI, one per office. Every member reads it, because the
 * open thread shows its translations in it; only a manager sets it, as the auto-reply switch is
 * set (an agent gets 403, a signed-out caller 401, the platform admin 403 as the inbox refuses
 * them). An office whose manager hasn't set one reads as the default, English.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const language = await getRuntime().store.officeLanguage(gate.viewer.officeId);
	return NextResponse.json({ language });
}

/**
 * A manager sets it. Translations already made in the other language are kept; a thread opened
 * afterwards is translated into the new one then (decided by Eyal, 2026-10-08). Each open
 * thread's template suggested reply has its operator line written again in the new one, in the
 * background (#242): no model call.
 */
export async function PUT(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") {
		return NextResponse.json(
			{ error: "forbidden", message: "Only a manager sets the office language." },
			{ status: 403 },
		);
	}
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const { store } = getRuntime();
	await store.setOfficeLanguage(gate.viewer.officeId, parsed.data.language);
	const { viewer } = gate;
	void runInBackground("template refresh", () => refreshOfficeTemplates(store, viewer));
	return NextResponse.json({ language: parsed.data.language });
}
