import { crmKindTakesToken } from "@inbox/lib/crm/adapters";
import { createCrmSync } from "@inbox/lib/crm/sync";
import { threadUrl } from "@inbox/lib/inbox";
import { requirePlatformAdmin } from "@inbox/lib/require-platform-admin";
import { getRuntime } from "@inbox/lib/runtime";
import { CrmKind } from "@inbox/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({
	officeId: z.string().min(1),
	kind: CrmKind.nullable(),
	/** The office's access token, for a kind that takes one (write-only, never read back). */
	token: z.string().max(4096).optional(),
});

/**
 * The office's CRM as the platform admin sees it (Admin → the office → Connections, ADR 0003),
 * with the kinds there are to choose from and those that take an access token, so the client
 * never restates them. Whether a token is set, never the token.
 */
export async function GET(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const officeId = new URL(request.url).searchParams.get("officeId");
	if (!officeId) return NextResponse.json({ error: "office_required" }, { status: 400 });
	const { store } = getRuntime();
	if (!(await store.officeExists(officeId))) {
		return NextResponse.json({ error: "office_not_found" }, { status: 404 });
	}
	const connection = await store.getCrmConnection(officeId);
	return NextResponse.json({
		kind: connection?.kind ?? null,
		tokenSet: connection?.tokenSet ?? false,
		kinds: CrmKind.options,
		tokenKinds: CrmKind.options.filter(crmKindTakesToken),
	});
}

/**
 * The platform admin sets the office's CRM, or none (spec #59, Q6), with its access token where
 * the kind takes one (#65; 400 without it). New guests then become leads in it; another kind, or
 * none, drops the office's thread links and its token. The answer never carries the token.
 */
export async function PUT(request: Request): Promise<Response> {
	const gate = await requirePlatformAdmin(request);
	if (gate.denied) return gate.denied;
	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
	const { officeId, kind, token } = parsed.data;
	const runtime = getRuntime();
	const sync = createCrmSync({
		store: runtime.store,
		threadUrl,
		secretsKey: runtime.config.pipeSecretsKey,
	});
	const result = await sync.connectOffice(officeId, kind, token);
	switch (result) {
		case "no_office":
			return NextResponse.json({ error: "office_not_found" }, { status: 404 });
		case "token_required":
			return NextResponse.json({ error: "token_required" }, { status: 400 });
		case "no_secrets_key":
			// The deployment cannot store a token encrypted (PIPE_SECRETS_KEY unset, ADR 0017).
			return NextResponse.json({ error: "secrets_key_missing" }, { status: 503 });
		case "connected":
			return NextResponse.json({ kind, tokenSet: crmKindTakesToken(kind) });
	}
}
