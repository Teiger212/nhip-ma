/**
 * Nhịp's service worker (ADR 0019, #135): it shows an alert's push and opens it. Nothing else:
 * no fetch handler and no caching, so the app is always the network's. Served with
 * `Cache-Control: no-cache` (next.config.ts), so a new version takes over on the next visit.
 *
 * A push's payload (`AlertPayload`) is { alertId, tag, title, body, url, sound }: a thread's tag,
 * so a new alert replaces the last on the device; `sound` says whether the replacement sounds
 * (`renotify`). Apple's WebKit ignores `renotify`, so it is left out there and whether a
 * replacement sounds is the platform's call. The url is the alert's opaque link, never a thread.
 */

const FALLBACK_TITLE = "Nhịp";
const FALLBACK_URL = "/inbox";

const userAgent = self.navigator.userAgent;
const appleWebKit =
	/iPhone|iPad|iPod/.test(userAgent) ||
	(/Macintosh/.test(userAgent) &&
		/Safari/.test(userAgent) &&
		!/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(userAgent));

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	// Open Nhịp windows come under this worker at once, so a click can take them to the alert.
	event.waitUntil(self.clients.claim());
});

/** The link to open, on Nhịp's own origin only. */
function sameOriginUrl(value) {
	try {
		const url = new URL(typeof value === "string" ? value : FALLBACK_URL, self.location.origin);
		return url.origin === self.location.origin
			? url.href
			: new URL(FALLBACK_URL, self.location.origin).href;
	} catch {
		return new URL(FALLBACK_URL, self.location.origin).href;
	}
}

self.addEventListener("push", (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = {};
	}
	const title = typeof payload.title === "string" && payload.title ? payload.title : FALLBACK_TITLE;
	const options = {
		body: typeof payload.body === "string" ? payload.body : "",
		icon: "/icons/icon-192.png",
		data: { url: sameOriginUrl(payload.url) },
	};
	if (typeof payload.tag === "string" && payload.tag) {
		options.tag = payload.tag;
		if (!appleWebKit) options.renotify = payload.sound === true;
	}
	// Every push shows something: a push that shows nothing is penalised by the browser.
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = sameOriginUrl(event.notification.data && event.notification.data.url);
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
			if (!open) {
				await self.clients.openWindow(url);
				return;
			}
			const focused = (await open.focus()) || open;
			try {
				await focused.navigate(url);
			} catch {
				// A window this worker doesn't control can't be navigated; open the alert beside it.
				await self.clients.openWindow(url);
			}
		})(),
	);
});
