import type { CrmKind, InboxStore } from "@repo/database/inbox";

import { mockCrmAdapter } from "./mock";
import type { CrmAdapter } from "./types";

export type { CrmAdapter, CrmLead, CrmOutcome } from "./types";
export { guestPhone, toE164 } from "./phone";

/** The only place a CRM kind becomes an adapter (ADR 0003). */
export function crmAdapterFor(
	connection: { kind: CrmKind },
	deps: { store: InboxStore; officeId: string },
): CrmAdapter {
	switch (connection.kind) {
		case "mock":
			return mockCrmAdapter(deps.store, deps.officeId);
	}
}
