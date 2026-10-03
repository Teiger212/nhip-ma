import type { CrmKind, InboxStore } from "@repo/database/inbox";

import { mockCrmAdapter } from "./mock";
import type { CrmAdapter } from "./types";

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
