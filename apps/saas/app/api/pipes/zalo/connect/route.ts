import { zaloPermissionUrl } from "@inbox/lib/pipes/vendors";
import {
	beginZaloConnect,
	ZALO_CONNECT_COOKIE,
	zaloCallbackUrl,
} from "@inbox/lib/pipes/zalo-connect";
import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { db } from "@repo/database";
import { getBaseUrl } from "@repo/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The platform admin connects an office's Zalo OA (ADR 0017): this sends the browser to
 * Zalo's consent page, where the OA owner approves Nhịp's app; Zalo returns to the callback.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	// Only from Nhịp's own admin page: a link on another site must not start a connect
	// (the admin's Zalo session could approve an OA into an office the attacker chose).
	const site = request.headers.get("sec-fetch-site");
	if (site && site !== "same-origin" && site !== "none") {
		return NextResponse.json({ error: "cross_site" }, { status: 403 });
	}
	const officeId = new URL(request.url).searchParams.get("officeId");
	if (!officeId) {
		return NextResponse.json({ error: "office_required" }, { status: 400 });
	}
	const office = await db.organization.findUnique({
		where: { id: officeId },
		select: { id: true },
	});
	if (!office) {
		return NextResponse.json({ error: "office_not_found" }, { status: 404 });
	}
	const { config } = getRuntime();
	if (!config.zalo.appId || !config.zalo.appSecret || !config.pipeSecretsKey) {
		return NextResponse.json(
			{ error: "zalo_not_configured", message: "This deployment has no Zalo app configured." },
			{ status: 503 },
		);
	}
	const attempt = beginZaloConnect(officeId, config);
	const response = NextResponse.redirect(
		zaloPermissionUrl({
			appId: config.zalo.appId,
			redirectUri: zaloCallbackUrl(getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000)),
			state: attempt.state,
			codeChallenge: attempt.challenge,
		}),
	);
	response.cookies.set(ZALO_CONNECT_COOKIE, attempt.cookie, {
		httpOnly: true,
		secure: new URL(request.url).protocol === "https:",
		// Lax: the cookie must come back on Zalo's top-level redirect to the callback.
		sameSite: "lax",
		path: "/api/pipes/zalo",
		maxAge: attempt.maxAgeSec,
	});
	return response;
}
