import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * One alert to one operator, as the log holds it (ADR 0019). E2E runs with `SEND_MODE=mock`:
 * Nhịp decides every alert as it would live, writes this row, and pushes nothing.
 */
export type AlertRow = {
	/** Opaque; the only thing the alert carries. */
	id: string;
	/** The operator alerted. */
	userId: string;
	/** The thread, or null for a test alert. */
	conversationId: string | null;
	officeId: string;
	kind: "guest" | "returned" | "assigned" | "test";
	/** False: a silent replacement of the thread's last alert for this operator. */
	sounded: boolean;
	/** `/<locale>/inbox?alert=<id>`, in the operator's locale. */
	link: string;
	/** ISO time. */
	createdAt: string;
};

/** An operator's device (a push subscription). */
export type DeviceRow = { id: string; userId: string };

/** Reading the alert log is looking at the operators' phones (alert-state.ts). */
export const alertState = {
	/** Every alert in the office, oldest first. */
	alerts(officeId: string): AlertRow[] {
		return JSON.parse(run(["alerts", officeId])) as AlertRow[];
	},
	/** The operator's devices, oldest first. */
	devices(userId: string): DeviceRow[] {
		return JSON.parse(run(["devices", userId])) as DeviceRow[];
	},
};

function run(args: string[]): string {
	return execFileSync(
		"pnpm",
		["exec", "tsx", "--tsconfig", "tsconfig.json", "tests/support/alert-state.ts", ...args],
		{
			cwd: path.resolve(__dirname, "../.."),
			stdio: ["ignore", "pipe", "inherit"],
			encoding: "utf8",
		},
	);
}
