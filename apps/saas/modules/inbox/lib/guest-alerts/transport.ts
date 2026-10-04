import type { InboxConfig } from "../config";

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

/** Sends one operator's alert to their devices; the row in `inbox_alert` is already written. */
export type AlertTransport = {
	send: (userId: string, payload: AlertPayload) => Promise<void>;
};

/** `SEND_MODE=mock`: alerts are decided and logged exactly as live, and nothing is pushed. */
const mockTransport: AlertTransport = {
	send: async () => {},
};

/**
 * `SEND_MODE=live`: web push to each of the operator's devices arrives with #134 (devices and
 * the live push). Until then it writes the log only, like the mock.
 */
const liveTransport: AlertTransport = {
	send: async () => {},
};

/** The transport seam, chosen by the deployment's send mode. */
export function alertTransport(config: Pick<InboxConfig, "sendMode">): AlertTransport {
	return config.sendMode === "live" ? liveTransport : mockTransport;
}
