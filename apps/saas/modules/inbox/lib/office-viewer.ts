import { db } from "@repo/database";

import type { InboxViewer } from "./types";

export type OfficeViewer = { userId: string; role: "agent" | "manager"; officeSlug: string | null };

/**
 * The signed-in operator's role in their office (ADR 0015) and the office's slug. One
 * definition for `/api/office` and for the Inbox's server prefetch, so both say the same.
 */
export async function readOfficeViewer(viewer: InboxViewer): Promise<OfficeViewer> {
	const office = await db.organization.findUnique({
		where: { id: viewer.officeId },
		select: { slug: true },
	});
	return {
		userId: viewer.userId,
		role: viewer.role ?? "agent",
		officeSlug: office?.slug ?? null,
	};
}
