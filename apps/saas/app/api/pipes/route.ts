import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** An office's pipe connections as the platform admin sees them (Admin → the office → Connections). */
export async function GET(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const officeId = new URL(request.url).searchParams.get("officeId");
	if (!officeId) return NextResponse.json({ error: "office_required" }, { status: 400 });
	const { config, store } = getRuntime();
	return NextResponse.json({
		configured: {
			zalo: Boolean(config.zalo.appId && config.zalo.appSecret && config.pipeSecretsKey),
			whatsapp: Boolean(config.whatsapp.accessToken && config.whatsapp.phoneNumberId),
		},
		pipes: await store.officePipes(officeId),
	});
}
