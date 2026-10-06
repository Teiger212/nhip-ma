import { askState } from "./state-client";

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

/**
 * Reading the alert log is looking at the operators' phones (alert-state.ts). Each call reads
 * the log afresh.
 */
export const alertState = {
	/** Every alert in the office, oldest first. */
	alerts(officeId: string): Promise<AlertRow[]> {
		return askState<AlertRow[]>("alerts.alerts", officeId);
	},
	/** The operator's devices, oldest first. */
	devices(userId: string): Promise<DeviceRow[]> {
		return askState<DeviceRow[]>("alerts.devices", userId);
	},
};
