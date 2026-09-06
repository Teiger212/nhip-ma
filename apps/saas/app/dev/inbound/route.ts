import { isDevInboundEnabled } from "@inbox/lib/dev";
import { injectDevInbound } from "@inbox/lib/inbox";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * `at` reaches `nowIso()`, which calls `new Date(at).toISOString()`. An unparsable value
 * throws `RangeError` there, which surfaced as a 500; this checks exactly the precondition
 * `nowIso` needs so a bad `at` is a 400 instead. It stays permissive on purpose: any date
 * string `Date` accepts still works, as it did before.
 */
const at = z.union([
	z.number().refine(Number.isFinite, "at must be a finite epoch-millisecond number"),
	z
		.string()
		.refine((value) => !Number.isNaN(new Date(value).getTime()), "at must be a parsable date"),
]);

/**
 * `pipe` mirrors the `Pipe` vocabulary in `packages/database/inbox/schema.ts`. It is
 * restated rather than imported because `@repo/database` exposes no `./inbox/schema`
 * subpath and `inbox/index.ts` re-exports types only, so no zod value from that module can
 * reach this app today.
 *
 * The optional fields carry `.catch(null)` so a wrong-typed `guestName` degrades to null
 * exactly as the hand-rolled narrowing did. Only the fields the injector cannot work
 * without, plus `at`, can produce a 400.
 */
const devInboundBody = z.object({
	pipe: z.enum(["zalo", "whatsapp"]),
	guestId: z.string().trim().min(1),
	text: z.string().trim().min(1),
	guestName: z.string().nullish().catch(null),
	vendorMessageId: z.string().nullish().catch(null),
	// No `.catch` here: swallowing a bad `at` is the 500 this is meant to turn into a 400.
	at: at.optional(),
});

export async function POST(request: Request): Promise<Response> {
	if (!isDevInboundEnabled()) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	const parsed = devInboundBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body"))];
		return NextResponse.json(
			{
				error: "bad_request",
				message: `invalid ${fields.join(", ")}. pipe (zalo|whatsapp), guestId, and text are required; at must be an epoch-millisecond number or a parsable date string`,
			},
			{ status: 400 },
		);
	}
	const body = parsed.data;
	const conversation = await injectDevInbound({
		pipe: body.pipe,
		guestId: body.guestId,
		text: body.text,
		guestName: body.guestName ?? null,
		vendorMessageId: body.vendorMessageId ?? null,
		at: body.at ?? Date.now(),
	});
	return NextResponse.json({ ok: true, conversation });
}
