"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * This browser and alerts (ADR 0019 "Asking", #135): whether the deployment can push (its VAPID
 * public key, handed to the page by the server), whether this sign-in has a device, what the
 * browser allows, and turning alerts on. Nothing here ever asks for permission on its own: only
 * a tap on "Turn on alerts" does.
 */

/** What the server says about alerts for this sign-in (`GET /api/alerts/devices`). */
export type ThisDeviceStatus = {
	/** The deployment's VAPID public key; null when it has none, and nothing can be turned on. */
	publicKey: string | null;
	/** This sign-in has a device: alerts are on here. */
	on: boolean;
};

export const thisDeviceQueryKey = ["alerts", "this-device"] as const;

export function useThisDevice({ enabled = true }: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: thisDeviceQueryKey,
		queryFn: async (): Promise<ThisDeviceStatus> => {
			const res = await fetch("/api/alerts/devices");
			if (!res.ok) throw new Error(`alerts status ${res.status}`);
			return (await res.json()) as ThisDeviceStatus;
		},
		enabled,
		// An operator without an office is refused; asking again will not change that.
		retry: false,
	});
}

/** What this browser allows. An iPhone gets web push only from the Home Screen (iOS 16.4+). */
export type BrowserAlerts = "unsupported" | "iphoneNotInstalled" | NotificationPermission; // "default" | "denied" | "granted"

function isIphone(userAgent: string): boolean {
	return /iPhone|iPad|iPod/.test(userAgent);
}

function isInstalled(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** Read in the browser only, after mount. */
export function browserAlerts(): BrowserAlerts {
	if (isIphone(navigator.userAgent) && !isInstalled()) return "iphoneNotInstalled";
	if (
		!("serviceWorker" in navigator) ||
		!("PushManager" in window) ||
		!("Notification" in window)
	) {
		return "unsupported";
	}
	return Notification.permission;
}

/** "Not now" hides the panel on this device, in this browser only, for 7 days. */
export const NOT_NOW_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_NOW_KEY = "nhip.alerts.notNowAt";

export function notNow(now = Date.now()): void {
	try {
		localStorage.setItem(NOT_NOW_KEY, String(now));
	} catch {
		// Storage refused (a private window): the panel just comes back next time.
	}
}

export function saidNotNow(now = Date.now()): boolean {
	try {
		const at = Number(localStorage.getItem(NOT_NOW_KEY));
		return Number.isFinite(at) && at > 0 && now - at < NOT_NOW_MS;
	} catch {
		return false;
	}
}

/**
 * What the Inbox's alerts panel shows (#135): nothing while loading, when the deployment has no
 * VAPID keys, in a browser with no web push, when alerts are on here, or for 7 days after "Not
 * now"; else asks, gives the iPhone's Home Screen steps, says how to unblock, or asks again
 * when this sign-in's device is gone.
 */
export type AlertsPanelState = "nothing" | "ask" | "iphone" | "blocked" | "gone";

export function alertsPanelState({
	status,
	browser,
	notNowSaid,
}: {
	status: ThisDeviceStatus | undefined;
	browser: BrowserAlerts | null;
	notNowSaid: boolean;
}): AlertsPanelState {
	if (!status || !browser || !status.publicKey || notNowSaid) return "nothing";
	if (browser === "iphoneNotInstalled") return "iphone";
	if (browser === "unsupported") return "nothing";
	if (browser === "denied") return "blocked";
	if (browser === "granted") return status.on ? "nothing" : "gone";
	return "ask";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
	const key = subscription.options.applicationServerKey;
	if (!key) return false;
	const have = new Uint8Array(key);
	const want = keyBytes(publicKey);
	return have.length === want.length && have.every((byte, i) => byte === want[i]);
}

async function register(subscription: PushSubscription): Promise<Response> {
	return fetch("/api/alerts/devices", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(subscription.toJSON()),
	});
}

export type TurnOnOutcome = "on" | "denied" | "dismissed" | "failed";

/**
 * Turn alerts on for this browser, on the operator's tap: the browser's permission prompt, the
 * service worker, a push subscription for the deployment's key (`userVisibleOnly`), then
 * `POST /api/alerts/devices`. A 409 means the endpoint is another operator's with other keys
 * (proof of possession, #135): this browser drops it and subscribes afresh, once.
 */
export async function turnOnAlerts(publicKey: string): Promise<TurnOnOutcome> {
	try {
		const permission = await Notification.requestPermission();
		if (permission === "denied") return "denied";
		if (permission !== "granted") return "dismissed";
		await navigator.serviceWorker.register("/sw.js", { scope: "/" });
		const registration = await navigator.serviceWorker.ready;
		const subscribe = () =>
			registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: keyBytes(publicKey),
			});
		let subscription = await registration.pushManager.getSubscription();
		if (subscription && !sameKey(subscription, publicKey)) {
			// Made for another key pair (a rotated one): it can't carry this deployment's pushes.
			await subscription.unsubscribe();
			subscription = null;
		}
		subscription ??= await subscribe();
		let response = await register(subscription);
		if (response.status === 409) {
			await subscription.unsubscribe();
			subscription = await subscribe();
			response = await register(subscription);
		}
		return response.ok ? "on" : "failed";
	} catch {
		return "failed";
	}
}

/**
 * Signing out also unsubscribes this browser (#135), so its endpoint is dead as well as removed
 * on the server. Best effort and quick: it never holds up the sign-out.
 */
export async function unsubscribeThisBrowser(): Promise<void> {
	const work = (async () => {
		if (!("serviceWorker" in navigator)) return;
		const registration = await navigator.serviceWorker.getRegistration();
		const subscription = await registration?.pushManager.getSubscription();
		await subscription?.unsubscribe();
	})().catch(() => undefined);
	await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 1500))]);
}
