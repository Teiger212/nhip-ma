import { refuseImpersonation, sendTestAlert } from "@inbox/lib/guest-alerts/devices";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * "Send test alert" (ADR 0019): a `test` alert for the operator, pushed to this sign-in's
 * devices in a live deployment. 409 when this sign-in has no device.
 */
export async function POST(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const impersonating = refuseImpersonation(gate.session);
	if (impersonating) return impersonating;
	const outcome = await sendTestAlert(getRuntime(), {
		userId: gate.viewer.userId,
		officeId: gate.viewer.officeId,
		sessionId: gate.session.id,
	});
	if (outcome === "no_device") {
		return NextResponse.json({ error: "no_device" }, { status: 409 });
	}
	return NextResponse.json({ ok: true }, { status: 202 });
}
