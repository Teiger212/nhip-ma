import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { db } from "@repo/database";
import { createNotification, NOTIFICATION_TYPES } from "@repo/notifications";

import type { Pipe } from "../types";

/**
 * A pipe connection stopped working (ADR 0017): every platform admin gets a bell row naming
 * the pipe and the office, since only they reconnect it, and the office shows "Needs
 * reconnect". No email (PRODUCT.md "Deliberately not"). The bell renders the row in the
 * reader's language from `data`. Best effort: a failed alert is logged and never blocks the
 * send path.
 */
export async function notifyPipeDisconnected(input: {
	pipe: Pipe;
	externalId: string;
	reason: string;
}): Promise<void> {
	try {
		const connection = await db.pipeConnection.findUnique({
			where: { pipe_externalId: { pipe: input.pipe, externalId: input.externalId } },
			select: { office: { select: { id: true, name: true } } },
		});
		const admins = await db.user.findMany({
			where: { role: { contains: "admin" } },
			select: { id: true, role: true },
		});
		const office = connection?.office;
		for (const admin of admins.filter((user) => isPlatformAdmin(user.role))) {
			await createNotification({
				userId: admin.id,
				type: NOTIFICATION_TYPES.PIPE_DISCONNECTED,
				data: {
					pipe: input.pipe,
					externalId: input.externalId,
					office: office?.name ?? null,
					reason: input.reason,
				},
				link: office ? `/admin/organizations/${office.id}` : "/admin/organizations",
			});
		}
	} catch (err) {
		console.error(`[pipes] could not alert about ${input.pipe} ${input.externalId}`, err);
	}
}
