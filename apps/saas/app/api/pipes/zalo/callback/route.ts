import {
	completeZaloConnect,
	readZaloConnect,
	ZALO_CONNECT_COOKIE,
} from "@inbox/lib/pipes/zalo-connect";
import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { getBaseUrl } from "@repo/utils";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Zalo returns here after the OA owner approved Nhịp's app (ADR 0017). The attempt must be
 * this browser's own (state in the sealed cookie); `completeZaloConnect` does the rest. Back
 * to the office's admin page with the outcome.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const url = new URL(request.url);
	const { config, store } = getRuntime();
	const jar = await cookies();
	const attempt = readZaloConnect(
		jar.get(ZALO_CONNECT_COOKIE)?.value,
		url.searchParams.get("state"),
		config,
	);
	const outcome = attempt
		? await completeZaloConnect({
				attempt,
				code: url.searchParams.get("code"),
				claimedOaId: url.searchParams.get("oa_id"),
				config,
				store,
			})
		: "expired";
	const target = new URL(
		attempt
			? `/admin/organizations/${encodeURIComponent(attempt.officeId)}`
			: "/admin/organizations",
		getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000),
	);
	target.searchParams.set("zalo", outcome);
	const response = NextResponse.redirect(target);
	response.cookies.delete({ name: ZALO_CONNECT_COOKIE, path: "/api/pipes/zalo" });
	return response;
}
