import { setNameGuestsSee } from "@inbox/lib/inbox";
import { NameGuestsSee } from "@inbox/lib/name-guests-see";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({ nameGuestsSee: NameGuestsSee.nullable() });

/**
 * The operator's own name guests see (#266): the name the template suggested reply introduces
 * them by (ADR 0024). Any member of an office reads and sets their own; a signed-out caller gets
 * 401 and the platform admin 403 (they own no threads), as the inbox refuses them.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const nameGuestsSee = await getRuntime().store.nameGuestsSee(gate.viewer.userId);
	return NextResponse.json({ nameGuestsSee });
}

/**
 * Sets it (blank or null clears it), then writes the untouched template suggested reply again on
 * every open thread the operator owns, as assigning does: never typed text, never a model draft.
 */
export async function PUT(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const nameGuestsSee = await setNameGuestsSee(
		getRuntime().store,
		gate.viewer,
		parsed.data.nameGuestsSee,
	);
	return NextResponse.json({ nameGuestsSee });
}
