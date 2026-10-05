import { DeviceRegistration, refuseImpersonation } from "@inbox/lib/guest-alerts/devices";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import {
	addPushSubscription,
	deletePushSubscriptionsForSession,
	pushSubscriptionsForSession,
} from "@repo/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Enough of the user agent to tell one device from another. */
const USER_AGENT_LENGTH = 256;

/**
 * Alerts on this sign-in's browser (#135): the deployment's VAPID public key, which the page
 * subscribes with (null when it has none, and nothing can be turned on), and whether this
 * sign-in has a device, which is what "alerts are on here" means.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const devices = await pushSubscriptionsForSession(gate.viewer.userId, gate.session.id);
	return NextResponse.json(
		{ publicKey: getRuntime().config.vapid?.publicKey ?? null, on: devices.length > 0 },
		{ headers: { "Cache-Control": "no-store" } },
	);
}

/**
 * This sign-in turns alerts on for its browser (ADR 0019, #134): the browser's push
 * subscription, on an allowed push service only, becomes one of the operator's devices. An
 * endpoint another operator holds moves here only with that browser's own keys, else 409 and
 * the browser subscribes afresh (#135); a sign-in that ended meanwhile keeps nothing (401).
 * Past 10 devices the oldest goes (Q2).
 */
export async function POST(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const impersonating = refuseImpersonation(gate.session);
	if (impersonating) return impersonating;
	const parsed = DeviceRegistration.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const outcome = await addPushSubscription({
		userId: gate.viewer.userId,
		sessionId: gate.session.id,
		endpoint: parsed.data.endpoint,
		p256dh: parsed.data.keys.p256dh,
		auth: parsed.data.keys.auth,
		userAgent: request.headers.get("user-agent")?.slice(0, USER_AGENT_LENGTH) || null,
	});
	if (outcome === "taken") {
		return NextResponse.json({ error: "endpoint_taken" }, { status: 409 });
	}
	if (outcome === "signed_out") {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	return NextResponse.json({ ok: true }, { status: 201 });
}

/** This sign-in turns alerts off: its devices go, and no one else's. */
export async function DELETE(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	await deletePushSubscriptionsForSession(gate.session.id);
	return new Response(null, { status: 204 });
}
