import { cookies } from "next/headers";
import type { PropsWithChildren } from "react";

import { AppShell } from "./AppShell";

/**
 * The kit's sidebar cookie (`packages/ui/components/sidebar.tsx`, which keeps it client-side).
 * Read here so a sidebar collapsed before a reload is collapsed in the server's HTML too: no
 * open first frame that then snaps shut (#234).
 */
const SIDEBAR_COOKIE = "sidebar_state";

export async function AppWrapper({ children }: PropsWithChildren) {
	// Read as the kit reads it: open with no cookie, otherwise open only when it says "true".
	const saved = (await cookies()).get(SIDEBAR_COOKIE)?.value;
	const sidebarOpen = saved === undefined || saved === "true";

	return <AppShell sidebarOpen={sidebarOpen}>{children}</AppShell>;
}
