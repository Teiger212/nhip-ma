import { createGuestDeletion } from "@inbox/lib/guest-deletion";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** The manager's choice for the thread's CRM lead, always explicit (ADR 0020). */
const body = z.object({ deleteInCrm: z.boolean() });

/**
 * A manager deletes a guest's data (ADR 0020). Answers in this order: the inbox gate (401, or
 * 403 for the platform admin), 403 for an agent before the body is read, 404 for a thread the
 * office does not have, 400 without `{ deleteInCrm }`, 409 while a reply is sending, else 200
 * with what became of the CRM lead. Nothing here logs the thread id: it is the guest's thread.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	if (gate.viewer.role !== "manager") {
		// An agent asks a manager, as for reassign (ADR 0015).
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}
	const id = decodeURIComponent((await context.params).id);
	const runtime = getRuntime();
	if (!(await runtime.store.getOfficeConversation(gate.viewer.officeId, id))) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	const parsed = body.safeParse(await readJson(request));
	if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

	const deletion = createGuestDeletion({
		store: runtime.store,
		countMock: runtime.config.sendMode !== "live",
	});
	let result: Awaited<ReturnType<typeof deletion.deleteGuest>>;
	try {
		result = await deletion.deleteGuest(gate.viewer, id, parsed.data);
	} catch (error) {
		// A category only: a database error's detail can quote the row's keys (spec #85, story 30).
		console.error("guest deletion failed", { kind: errorKind(error) });
		return NextResponse.json({ error: "deletion_failed" }, { status: 500 });
	}
	if (!result.ok) {
		return result.reason === "reply_sending"
			? NextResponse.json({ error: "reply_sending" }, { status: 409 })
			: NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	return NextResponse.json({ crm: result.crm });
}

/** The body as JSON, or null when there is none or it isn't JSON (a 400, not a 500). */
async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

function errorKind(error: unknown): string {
	if (typeof error === "object" && error !== null && "code" in error) return String(error.code);
	return error instanceof Error ? error.name : "unknown";
}
