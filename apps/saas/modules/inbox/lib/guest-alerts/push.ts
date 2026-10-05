import {
	deletePushSubscription,
	markPushSubscriptionDelivered,
	type PushDevice,
	pushSubscriptionsForSession,
	pushSubscriptionsForUser,
} from "@repo/database";
import { sendNotification } from "web-push";

import type { Vapid } from "../config";
import type { AlertDelivery, AlertPayload, AlertTransport } from "./transport";

/** The push services' hosts (spec #84): Google's, Mozilla's exactly; Apple's, Microsoft's by domain. */
const EXACT_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const HOST_DOMAINS = [".push.apple.com", ".notify.windows.com"];

/**
 * Whether a subscription's endpoint is a push service Nhịp posts to (spec #84): `https` on
 * Google's, Apple's, Mozilla's or Microsoft's push host, on the default port, with no
 * credentials. The server never posts anywhere else.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
	const host = url.hostname;
	return EXACT_HOSTS.includes(host) || HOST_DOMAINS.some((domain) => host.endsWith(domain));
}

/** At most this many pushes in flight per event (#134, Q4); #177's job queue replaces it. */
const CONCURRENCY = 5;

/** A push the service may keep for an operator whose phone is offline: an hour (spec #84). */
const TTL_SECONDS = 60 * 60;

/** Where the transport finds and updates devices; the database unless a test says otherwise. */
export type PushDevices = {
	forUser: (userId: string) => Promise<PushDevice[]>;
	forSession: (userId: string, sessionId: string) => Promise<PushDevice[]>;
	delivered: (id: string, at: Date) => Promise<void>;
	remove: (id: string) => Promise<void>;
};

const databaseDevices: PushDevices = {
	forUser: (userId) => pushSubscriptionsForUser(userId),
	forSession: (userId, sessionId) => pushSubscriptionsForSession(userId, sessionId),
	delivered: (id, at) => markPushSubscriptionDelivered(id, at),
	remove: (id) => deletePushSubscription(id),
};

/**
 * What a failed push is logged as: its HTTP status, or the kind of error. Never the error's
 * text, endpoint or body, which name the device (PDPL).
 */
function failureCategory(error: unknown): string {
	if (error && typeof error === "object" && "statusCode" in error) {
		const status = (error as { statusCode: unknown }).statusCode;
		if (typeof status === "number") return `http ${status}`;
	}
	return error instanceof Error ? error.name : "unknown";
}

function isGone(error: unknown): boolean {
	const status =
		error && typeof error === "object" && "statusCode" in error
			? (error as { statusCode: unknown }).statusCode
			: null;
	return status === 404 || status === 410;
}

/** Runs `work` over `items`, at most `limit` at a time; never rejects. */
async function eachLimited<T>(
	items: T[],
	limit: number,
	work: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0;
	const lane = async () => {
		while (next < items.length) {
			const item = items[next++];
			await work(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/**
 * `SEND_MODE=live` (#134): web push to each device of each delivery, VAPID-signed, urgency
 * high, kept by the push service for an hour. The payload is encrypted for the device (RFC
 * 8291); its tag and `sound` travel inside it, and the service worker turns `sound` into
 * `renotify` (#135). One event's pushes share one pool of 5, so a slow push service delays no
 * one. A 404 or 410 deletes the device. Without the VAPID keys it logs "push not configured"
 * and sends nothing, so a deployment works before its keys are set.
 */
export function webPushTransport(
	vapid: Vapid | null,
	devices: PushDevices = databaseDevices,
	now: () => Date = () => new Date(),
): AlertTransport {
	return {
		send: async (deliveries: AlertDelivery[]) => {
			if (deliveries.length === 0) return;
			if (!vapid) {
				console.warn("alerts: push not configured (no VAPID keys); alerts are logged only");
				return;
			}
			const pushes: { device: PushDevice; payload: AlertPayload }[] = [];
			for (const { userId, sessionId, payload } of deliveries) {
				const targets = sessionId
					? await devices.forSession(userId, sessionId)
					: await devices.forUser(userId);
				for (const device of targets) {
					if (isAllowedPushEndpoint(device.endpoint)) pushes.push({ device, payload });
					else console.warn("alerts: push skipped", { category: "endpoint not allowed" });
				}
			}
			const options = {
				urgency: "high" as const,
				TTL: TTL_SECONDS,
				vapidDetails: {
					subject: vapid.subject,
					publicKey: vapid.publicKey,
					privateKey: vapid.privateKey,
				},
			};
			await eachLimited(pushes, CONCURRENCY, async ({ device, payload }) => {
				try {
					await sendNotification(
						{ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
						JSON.stringify(payload),
						options,
					);
					await devices.delivered(device.id, now());
				} catch (error) {
					const category = failureCategory(error);
					try {
						if (isGone(error)) await devices.remove(device.id);
					} catch (cleanup) {
						console.warn("alerts: gone device not removed", {
							category: failureCategory(cleanup),
						});
					}
					console.warn("alerts: push failed", { category });
				}
			});
		},
	};
}
