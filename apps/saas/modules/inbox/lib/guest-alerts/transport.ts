import type { InboxConfig } from "../config";
import { webPushTransport } from "./push";

/**
 * What reaches an operator's device (ADR 0019): the alert's opaque id, the per-thread tag, the
 * text, the link and whether it sounds. Never the thread's id, the guest's id or the message.
 */
export type AlertPayload = {
	alertId: string;
	tag: string;
	title: string;
	body: string;
	url: string;
	sound: boolean;
};

/**
 * One alert to one operator, whose row in `inbox_alert` is already written: to every device
 * of theirs, or with `sessionId` to that sign-in's devices only (the test alert).
 */
export type AlertDelivery = { userId: string; payload: AlertPayload; sessionId?: string };

/**
 * Sends one event's alerts to the operators' devices. Never throws for a device: a push that
 * fails is logged as a category and costs no one else theirs.
 */
export type AlertTransport = {
	send: (deliveries: AlertDelivery[]) => Promise<void>;
};

/** `SEND_MODE=mock`: alerts are decided and logged exactly as live, and nothing is pushed. */
export const mockAlertTransport: AlertTransport = {
	send: async () => {},
};

/**
 * The transport seam, chosen by the deployment's send mode: live pushes with web push (#134),
 * VAPID-signed, and only logs "push not configured" until the VAPID keys are set.
 */
export function alertTransport(config: Pick<InboxConfig, "sendMode" | "vapid">): AlertTransport {
	return config.sendMode === "live" ? webPushTransport(config.vapid) : mockAlertTransport;
}
