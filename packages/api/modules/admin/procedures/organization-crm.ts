import { db } from "@repo/database";
import { CrmKind, createInboxStore } from "@repo/database/inbox";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

// Shares the app's Prisma client; never `close()` it here.
const store = () => createInboxStore(db);
const Output = z.object({ kind: CrmKind.nullable() });

/** The office's CRM (ADR 0003). Nhịp assigns it, like the office itself (ADR 0010). */
export const getOrganizationCrm = adminProcedure
	.route({
		method: "GET",
		path: "/admin/organizations/{id}/crm",
		tags: ["Administration"],
		summary: "Get the office's CRM",
	})
	.input(z.object({ id: z.string() }))
	.output(Output)
	.handler(async ({ input }) => ({
		kind: (await store().getCrmConnection(input.id))?.kind ?? null,
	}));

export const setOrganizationCrm = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/organizations/{id}/crm",
		tags: ["Administration"],
		summary: "Set the office's CRM",
	})
	.input(z.object({ id: z.string(), kind: CrmKind.nullable() }))
	.output(Output)
	.handler(async ({ input }) => {
		await store().setCrmConnection(input.id, input.kind);
		return { kind: input.kind };
	});
