import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

import { isWalkBypassAuthEnabled, WALK_USER_EMAIL, WALK_USER_PASSWORD } from "./walk-user";

function walkSignInHeaders(request: Request): Headers {
	const headers = new Headers(request.headers);
	const trustedOrigin = process.env.NEXT_PUBLIC_SAAS_URL ?? "http://localhost:3010";
	// Server-side sign-in must present an origin Better Auth already trusts
	// (baseURL / NEXT_PUBLIC_SAAS_URL). A Cloudflare quick-tunnel Origin would
	// fail CSRF even though this route is the walk bypass.
	headers.set("origin", trustedOrigin);
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

	const redirect = NextResponse.redirect(new URL("/inbox", request.url));
	copySetCookies(signInResponse.headers, redirect.headers);
	return redirect;
}
