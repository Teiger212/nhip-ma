import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Setup only (see crm-state.ts): the office is on the mock CRM and the guest's thread is
 * linked to a lead the CRM reports lost, as of now.
 */
export function markLeadLost(officeId: string, pipe: "zalo" | "whatsapp", guestId: string) {
	execFileSync(
		"pnpm",
		[
			"exec",
			"tsx",
			"--tsconfig",
			"tsconfig.json",
			"tests/support/crm-state.ts",
			"lost",
			officeId,
			pipe,
			guestId,
		],
		{ cwd: path.resolve(__dirname, "../.."), stdio: "inherit" },
	);
}
