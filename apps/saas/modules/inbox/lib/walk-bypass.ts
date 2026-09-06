import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

import {
	isWalkBypassAuthEnabled,
	WALK_USER_EMAIL,
	WALK_USER_PASSWORD,
	walkInboxRedirectUrl,
} from "./walk-user";

function walkSignInHeaders(request: Request): Headers {
	const headers = new Headers(request.headers);
	// Prefer NEXT_PUBLIC_SAAS_URL so a Cloudflare tunnel run that points
	// that env at *.trycloudflare.com stays on the public origin (not localhost).
	headers.set("origin", walkInboxRedirectUrl().origin);
	return headers;
}

function copySetCookies(from: Headers, to: Headers): void {
	const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [];
	if (cookies.length > 0) {
		for (const cookie of cookies) {
			to.append("Set-Cookie", cookie);
		}
		return;
	}

	const single = from.get("set-cookie");
	if (single) {
		to.append("Set-Cookie", single);
	}
}

export async function createWalkBypassResponse(request: Request): Promise<Response> {
	if (!isWalkBypassAuthEnabled()) {
		return NextResponse.json({ error: "Walk bypass is disabled" }, { status: 403 });
	}

	const signInResponse = await auth.api.signInEmail({
		body: {
			email: WALK_USER_EMAIL,
			password: WALK_USER_PASSWORD,
		},
		headers: walkSignInHeaders(request),
		asResponse: true,
	});

	if (!signInResponse.ok) {
		return NextResponse.json(
			{ error: "Walk bypass sign-in failed" },
			{ status: signInResponse.status },
		);
	}

	const redirect = NextResponse.redirect(walkInboxRedirectUrl());
	copySetCookies(signInResponse.headers, redirect.headers);
	return redirect;
}
