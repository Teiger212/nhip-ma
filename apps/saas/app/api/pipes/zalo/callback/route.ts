import { encryptSecret } from "@inbox/lib/pipes/secrets";
import { exchangeZaloCode, zaloOaProfile } from "@inbox/lib/pipes/vendors";
import { readZaloConnect, ZALO_CONNECT_COOKIE } from "@inbox/lib/pipes/zalo-connect";
import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { getBaseUrl } from "@repo/utils";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Zalo returns here after the OA owner approved Nhịp's app. The code becomes the OA's first
 * token pair, stored encrypted on the office's connection; the OA must not belong to
 * another office (ADR 0017). Back to the office's admin page with the outcome.
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
	const back = (officeId: string | null, outcome: string) => {
		const target = new URL(
			officeId ? `/admin/organizations/${officeId}` : "/admin/organizations",
			getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000),
		);
		target.searchParams.set("zalo", outcome);
		const response = NextResponse.redirect(target);
		response.cookies.delete({ name: ZALO_CONNECT_COOKIE, path: "/api/pipes/zalo" });
		return response;
	};
	if (!attempt) return back(null, "expired");
	const code = url.searchParams.get("code");
	if (!code || !config.zalo.appId || !config.zalo.appSecret || !config.pipeSecretsKey) {
		return back(attempt.officeId, "refused");
	}
	try {
		const tokens = await exchangeZaloCode({
			appId: config.zalo.appId,
			appSecret: config.zalo.appSecret,
			code,
			codeVerifier: attempt.verifier,
		});
		const oaId = url.searchParams.get("oa_id") ?? (await zaloOaProfile(tokens.accessToken)).oaId;
		const claimed = await store.claimPipe({
			pipe: "zalo",
			externalId: oaId,
			officeId: attempt.officeId,
		});
		if (!claimed.ok) return back(attempt.officeId, "held");
		await store.savePipeCredential("zalo", oaId, {
			accessToken: encryptSecret(tokens.accessToken, config.pipeSecretsKey),
			refreshToken: encryptSecret(tokens.refreshToken, config.pipeSecretsKey),
			accessTokenExpiresAt: new Date(Date.now() + tokens.expiresInSec * 1000),
		});
		return back(attempt.officeId, "connected");
	} catch (err) {
		console.error("[zalo] connect failed", err);
		return back(attempt.officeId, "failed");
	}
}
