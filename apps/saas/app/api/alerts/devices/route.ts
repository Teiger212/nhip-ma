import { DeviceRegistration } from "@inbox/lib/guest-alerts/devices";
import { requireInboxSession } from "@inbox/lib/require-session";
import { addPushSubscription, deletePushSubscriptionsForSession } from "@repo/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Enough of the user agent to tell one device from another. */
const USER_AGENT_LENGTH = 256;

/**
 * This sign-in turns alerts on for its browser (ADR 0019, #134): the browser's push
 * subscription, on an allowed push service only, becomes one of the operator's devices. An
 * endpoint someone else held moves to this operator (Q1); past 10 devices the oldest goes (Q2).
 */
export async function POST(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const parsed = DeviceRegistration.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	await addPushSubscription({
		userId: gate.viewer.userId,
		sessionId: gate.session.id,
		endpoint: parsed.data.endpoint,
		p256dh: parsed.data.keys.p256dh,
		auth: parsed.data.keys.auth,
		userAgent: request.headers.get("user-agent")?.slice(0, USER_AGENT_LENGTH) || null,
	});
	return NextResponse.json({ ok: true }, { status: 201 });
}

/** This sign-in turns alerts off: its devices go, and no one else's. */
export async function DELETE(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	await deletePushSubscriptionsForSession(gate.session.id);
	return new Response(null, { status: 204 });
}
