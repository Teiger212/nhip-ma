import { threadUrl } from "../inbox";
import { getRuntime } from "../runtime";
import type { CrmKind } from "../types";
import { crmWebhookFor } from "./adapters";
import { createCrmSync } from "./sync";

/**
 * A CRM's outcome webhook (ADR 0003, spec #59), the same for every kind: verified through the
 * kind's reader, then handed to the CRM sync module. 404 where this deployment has no such
 * webhook, 401 for anything unverified, 200 once handled (a notice for an office not on this
 * CRM is taken and ignored, so the CRM does not retry it).
 */
export async function handleCrmWebhook(kind: CrmKind, request: Request): Promise<Response> {
	const runtime = getRuntime();
	const read = crmWebhookFor(kind, runtime.config);
	if (!read) return Response.json({ error: "not_found" }, { status: 404 });
	const notice = read(await request.text(), request.headers);
	if (!notice) return Response.json({ error: "bad_signature" }, { status: 401 });
	await createCrmSync({ store: runtime.store, threadUrl }).outcomesChanged(
		notice.officeId,
		notice.leadIds,
		new Date(),
		{ from: kind },
	);
	return Response.json({ ok: true });
}
