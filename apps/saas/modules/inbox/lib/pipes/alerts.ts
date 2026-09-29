import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { db } from "@repo/database";
import { sendEmail } from "@repo/mail";

import { PIPE_NAMES } from "../pipe-names";
import type { Pipe } from "../types";

/**
 * A pipe connection stopped working (ADR 0017): every platform admin is emailed, since only
 * they reconnect it. Best effort: a failed alert is logged and never blocks the send path.
 */
export async function notifyPipeDisconnected(input: {
	pipe: Pipe;
	externalId: string;
	reason: string;
}): Promise<void> {
	try {
		const connection = await db.pipeConnection.findUnique({
			where: { pipe_externalId: { pipe: input.pipe, externalId: input.externalId } },
			select: { office: { select: { name: true } } },
		});
		const admins = await db.user.findMany({
			where: { role: { contains: "admin" } },
			select: { email: true, role: true },
		});
		const office = connection?.office.name ?? "an office";
		const name = PIPE_NAMES[input.pipe];
		for (const admin of admins.filter((user) => isPlatformAdmin(user.role))) {
			await sendEmail({
				to: admin.email,
				subject: `${name} disconnected for ${office}`,
				text: [
					`${name} (${input.externalId}) of ${office} can no longer send: ${input.reason}.`,
					"Guests' messages still arrive; replies on this pipe are blocked until you reconnect it",
					"with the owner present: Admin → Organizations → the office → Connections.",
				].join("\n"),
			});
		}
	} catch (err) {
		console.error(`[pipes] could not alert about ${input.pipe} ${input.externalId}`, err);
	}
}
