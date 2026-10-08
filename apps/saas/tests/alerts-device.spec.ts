import { createECDH, randomBytes, randomUUID } from "node:crypto";

import type { BrowserContext, Locator, Page } from "@playwright/test";

import { alertState } from "./support/alerts";
import type { WorkerAdmin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { joinOffice } from "./support/operators";
import type { Api } from "./support/session";
import { apiAs, clientIpHeaders, withOrigin } from "./support/session";
import { signInAgain } from "./support/session-state";

/**
 * The alerts panel and the "This device" row (ADR 0019 "Asking", #135). Headless Chromium cannot
 * show a permission prompt or subscribe to a push service, so the browser's notification
 * permission is set before each page loads (docs/e2e-scenarios.md, Alerts: "Permission state"),
 * and a device is added through the app's own API in the operator's own session ("A device").
 */

declare global {
	interface Window {
		/** How many times the page asked the browser for notification permission (the stub's count). */
		__alertPrompts?: number;
	}
}

/** The browser's notification permission, as the page reads it; `absent` is a browser with no Notification API. */
type Permission = "default" | "granted" | "denied" | "absent";

/** The decided English copy (#135). */
const COPY = {
	ask: "Get an alert when a guest writes.",
	stopped: "Alerts stopped on this device.",
	blocked: "Notifications are blocked for Nhịp on this device.",
	iphone: "On iPhone, alerts need Nhịp on your Home Screen.",
	turnOn: "Turn on alerts",
	notNow: "Not now",
	thisDevice: "This device",
	on: "Alerts are on for this device.",
	off: "Alerts are off for this device.",
	sendTest: "Send test alert",
	sent: "Test alert sent.",
} as const;

/** Every title the panel can carry: none of them shows when there is no panel. */
const PANEL_TITLES = [COPY.ask, COPY.stopped, COPY.blocked, COPY.iphone];

const DAY = 24 * 60 * 60 * 1000;

/**
 * A test alert is decided and logged like any alert, so a look at the log polls: at Playwright's
 * default intervals, since a read is one query (#203).
 */
const ON_THE_PHONES = { timeout: 30_000 };

/**
 * Sets the browser's notification permission before every load of the page (init script):
 * `Notification.permission`, `Notification.requestPermission`, the Permissions API and the push
 * manager's permission state all tell the same state. Every request for permission is counted in
 * `window.__alertPrompts` (a `pushManager.subscribe` while not granted also prompts, so it counts
 * too, and is refused). `absent` is Safari outside the Home Screen: no Notification API at all.
 */
function permissionStub(state: Permission) {
	window.__alertPrompts = 0;
	if (state === "absent") {
		Reflect.deleteProperty(window, "Notification");
		Reflect.deleteProperty(window, "PushManager");
		return;
	}
	const asked = (): void => {
		window.__alertPrompts = (window.__alertPrompts ?? 0) + 1;
	};
	const answer = state as NotificationPermission;
	const permissionState: PermissionState = state === "default" ? "prompt" : state;
	Object.defineProperty(Notification, "permission", { configurable: true, get: () => answer });
	Notification.requestPermission = ((callback?: NotificationPermissionCallback) => {
		asked();
		callback?.(answer);
		return Promise.resolve(answer);
	}) as typeof Notification.requestPermission;

	const permissions = navigator.permissions;
	if (permissions) {
		const query = permissions.query.bind(permissions);
		permissions.query = ((descriptor: PermissionDescriptor) => {
			if (descriptor.name === "notifications" || (descriptor.name as string) === "push") {
				const status = new EventTarget() as PermissionStatus;
				Object.defineProperty(status, "state", { value: permissionState });
				Object.defineProperty(status, "name", { value: descriptor.name });
				Object.defineProperty(status, "onchange", { value: null, writable: true });
				return Promise.resolve(status);
			}
			return query(descriptor);
		}) as typeof permissions.query;
	}

	if (typeof PushManager !== "undefined") {
		PushManager.prototype.permissionState = () => Promise.resolve(permissionState);
		// Subscribing while not granted is the browser's prompt too; granted, it is left as it is.
		if (state !== "granted") {
			PushManager.prototype.subscribe = () => {
				asked();
				return Promise.reject(new DOMException("Permission not granted", "NotAllowedError"));
			};
		}
	}
}

/** How many times this load of the page asked the browser for permission. */
function promptsOn(page: Page): Promise<number> {
	return page.evaluate(() => window.__alertPrompts ?? -1);
}

/* ---------------------------------------------------------------- devices */

/**
 * A push subscription as a browser hands it over (docs/e2e-scenarios.md "A device"): an endpoint
 * on an allow-listed push service no other test uses, a real P-256 public key (65 bytes,
 * uncompressed) and a 16-byte auth secret, both base64url.
 */
function newSubscription() {
	const ecdh = createECDH("prime256v1");
	ecdh.generateKeys();
	return {
		endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`,
		keys: {
			p256dh: ecdh.getPublicKey().toString("base64url"),
			auth: randomBytes(16).toString("base64url"),
		},
	};
}

/** The operator's browser adds this session's device, through the app's own API (setup). */
async function addDevice(api: Api, who: string) {
	const res = await api.post("/api/alerts/devices", newSubscription());
	expect(res.status(), `${who} adds a device (${res.status()} ${await res.text()})`).toBe(201);
}

/* ---------------------------------------------------------------- the operator */

/** One browser of the operator's: a session of its own. */
type Browsing = { context: BrowserContext; page: Page; api: Api };

/**
 * A new agent of this worker's office, who accepted their invitation (support/operators.ts). The
 * office is shared by the worker's tests; the agent is the test's own, and everything here reads
 * the agent's own sessions, devices and alerts.
 */
type Operator = Browsing & {
	officeId: string;
	id: string;
	/**
	 * The same agent signs in in another browser: a session of its own, minted for them (setup;
	 * signing in is the Auth specs'), with nothing of the first browser's storage, and this
	 * notification permission. Lands on the Inbox.
	 */
	signInElsewhere: (name: string, permission: Permission) => Promise<Browsing>;
};

/**
 * This worker's office (#278): the worker's platform admin (fixtures.ts `workerAdmin`) creates it
 * on the worker's first test here, and deletes it when the worker ends. Each test still invites a
 * new agent of its own into it, removed after the test.
 */
let workerOffice: Promise<string> | undefined;

function deviceOffice(workerAdmin: WorkerAdmin): Promise<string> {
	workerOffice ??= workerAdmin.createOffice("Alerts device").then(
		(office) => office.id,
		(error: unknown) => {
			workerOffice = undefined;
			throw error;
		},
	);
	return workerOffice;
}

const test = base.extend<{ newOperator: () => Promise<Operator> }>({
	newOperator: async ({ admin, browser, workerAdmin }, use) => {
		const contexts: BrowserContext[] = [];
		await use(async () => {
			const officeId = await deviceOffice(workerAdmin);
			const { userId, page, api } = await joinOffice(
				admin,
				browser,
				officeId,
				"member",
				"alerts-device",
			);
			const context = page.context();
			contexts.push(context);
			return {
				officeId,
				id: userId,
				context,
				page,
				api,
				signInElsewhere: async (name, permission) => {
					const other = await browser.newContext({
						extraHTTPHeaders: clientIpHeaders(`${userId}#${name}`),
					});
					contexts.push(other);
					await other.addInitScript(permissionStub, permission);
					await signInAgain(other, userId);
					const otherPage = await other.newPage();
					await otherPage.goto("/en/inbox");
					await expect(otherPage, `the agent signs in on ${name}`).toHaveURL(/\/en\/inbox/);
					return { context: other, page: otherPage, api: withOrigin(other.request) };
				},
			};
		});
		await Promise.all(contexts.map((context) => context.close()));
	},
});

/* ---------------------------------------------------------------- the panel */

/** The alerts panel on the Inbox's canvas, whatever it says (`data-test="alerts-panel"`). */
function alertsPanel(page: Page): Locator {
	return page.getByTestId("alerts-panel");
}

/** The operator's Inbox, loaded with this permission (the stub is set before the load). */
async function openInbox(page: Page, permission: Permission) {
	await page.addInitScript(permissionStub, permission);
	await page.goto("/en/inbox");
	await inboxLoaded(page);
}

/** The Inbox has loaded its (empty) thread list: what a load shows, it shows by now. */
async function inboxLoaded(page: Page) {
	await expect(page.getByRole("button", { name: /Your turn/ })).toBeVisible();
	await expect(page.getByTestId("inbox-empty")).toBeVisible();
}

/** No alerts panel on the loaded Inbox: no panel, none of its titles, nothing offering alerts. */
async function expectNoPanel(page: Page, why: string) {
	await expect(alertsPanel(page), why).toHaveCount(0);
	for (const title of PANEL_TITLES) {
		await expect(page.getByText(title, { exact: true }), `${why}: "${title}"`).toHaveCount(0);
	}
	await expect(page.getByRole("button", { name: COPY.turnOn }), `${why}: no pill`).toHaveCount(0);
}

/**
 * Every colour the panel paints, as sRGB bytes: each element's text, background, visible borders
 * and outline, and an SVG's fill and stroke. Computed colours may be `oklch(…)` (Tailwind v4), so
 * each is painted on a 1×1 canvas and read back. Also the theme's destructive colour, resolved.
 */
async function paintedColours(panel: Locator) {
	return panel.evaluate((root) => {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
		const SENTINEL = "#010203";
		const rgba = (value: string): number[] | null => {
			const v = value.trim();
			if (!v || v === "none" || v.startsWith("url(")) return null;
			ctx.fillStyle = SENTINEL;
			ctx.fillStyle = v;
			if (ctx.fillStyle === SENTINEL) return null;
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillRect(0, 0, 1, 1);
			return Array.from(ctx.getImageData(0, 0, 1, 1).data);
		};
		const rootStyle = getComputedStyle(document.documentElement);
		const destructive = ["--destructive", "--color-destructive"]
			.map((name) => rgba(rootStyle.getPropertyValue(name)))
			.filter((c): c is number[] => c !== null);

		const painted: { what: string; rgba: number[] }[] = [];
		for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
			if (el.getClientRects().length === 0) continue;
			const style = getComputedStyle(el);
			if (style.visibility === "hidden") continue;
			const name = `<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 40)}"`;
			const add = (prop: string, value: string) => {
				const c = rgba(value);
				if (c && c[3] >= 13) painted.push({ what: `${name} ${prop} ${value}`, rgba: c });
			};
			add("color", style.color);
			add("background-color", style.backgroundColor);
			for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
				if (parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none") {
					add(`border-${side.toLowerCase()}-color`, style[`border${side}Color`]);
				}
			}
			if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) {
				add("outline-color", style.outlineColor);
			}
			if (el instanceof SVGElement) {
				add("fill", style.fill);
				add("stroke", style.stroke);
			}
		}
		return { painted, destructive };
	});
}

/** Signal Red (#dc2626) and its night shade (#f87171), the colours of a refusal or an error. */
const SIGNAL_RED: number[][] = [
	[220, 38, 38],
	[248, 113, 113],
];

function near(a: number[], b: number[], tolerance = 16): boolean {
	return [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= tolerance);
}

/** Nothing on the panel is red: no Signal Red, day or night, and nothing in the destructive colour. */
async function expectNothingRed(panel: Locator, state: string) {
	await expect(panel, `the ${state} panel shows`).toBeVisible();
	const { painted, destructive } = await paintedColours(panel);
	expect(painted.length, `the ${state} panel paints something`).toBeGreaterThan(0);
	const reds = [...SIGNAL_RED, ...destructive];
	const red = painted.filter((p) => reds.some((r) => near(p.rgba, r))).map((p) => p.what);
	expect(red, `nothing on the ${state} panel is red`).toEqual([]);
}

/** Dispatch Blue (#2563eb), the one primary colour. */
const DISPATCH_BLUE = [37, 99, 235];

/** The button is a Dispatch Blue pill: blue fill, ends fully rounded. */
async function expectBluePill(button: Locator) {
	const look = await button.evaluate((el) => {
		const style = getComputedStyle(el);
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
		ctx.fillStyle = style.backgroundColor;
		ctx.fillRect(0, 0, 1, 1);
		return {
			background: Array.from(ctx.getImageData(0, 0, 1, 1).data),
			radius: parseFloat(style.borderTopLeftRadius),
			height: el.getBoundingClientRect().height,
		};
	});
	expect(
		near(look.background, DISPATCH_BLUE, 6),
		`"Turn on alerts" is Dispatch Blue (painted ${look.background.join(", ")})`,
	).toBe(true);
	expect(
		look.radius,
		`"Turn on alerts" is a pill (radius ${look.radius}, height ${look.height})`,
	).toBeGreaterThanOrEqual(look.height / 2 - 0.5);
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Alerts 9 (ADR 0019 "Asking", #135)
test.describe("Alerts 9 — the alerts panel asks, and only when asked to", () => {
	test.describe.configure({ timeout: 120_000 });

	test("permission not yet asked: no browser prompt on load; the panel offers one blue Turn on alerts pill and Not now, and nothing on it is red", async ({
		newOperator,
	}) => {
		const operator = await newOperator();
		const { page } = operator;
		await openInbox(page, "default");

		const panel = alertsPanel(page);
		await expect(panel.getByText(COPY.ask, { exact: true }), "the panel asks").toBeVisible();
		expect(await promptsOn(page), "loading the Inbox asks the browser nothing").toBe(0);

		const pill = panel.getByRole("button", { name: COPY.turnOn });
		await expect(pill, "one Turn on alerts").toHaveCount(1);
		await expect(panel.getByRole("button", { name: COPY.notNow }), "and Not now").toBeVisible();
		await expectBluePill(pill);
		await expectNothingRed(panel, "asking");

		await page.reload();
		await expect(panel.getByText(COPY.ask, { exact: true }), "it asks again").toBeVisible();
		expect(await promptsOn(page), "a reload asks the browser nothing either").toBe(0);

		// The stub counts: the browser is asked when the operator asks for alerts.
		await pill.click();
		await expect
			.poll(() => promptsOn(page), { message: "Turn on alerts asks the browser" })
			.toBeGreaterThanOrEqual(1);
	});

	test("Not now: the panel goes and stays gone across reloads, is back with the page's clock 7 days on, and another browser still shows it", async ({
		newOperator,
	}) => {
		const operator = await newOperator();
		const { page } = operator;
		const start = Date.now();
		await page.clock.install({ time: start });
		await openInbox(page, "default");

		const panel = alertsPanel(page);
		await expect(panel.getByText(COPY.ask, { exact: true }), "the panel asks").toBeVisible();
		await panel.getByRole("button", { name: COPY.notNow }).click();
		await expectNoPanel(page, "Not now hides the panel");

		await page.reload();
		await inboxLoaded(page);
		await expectNoPanel(page, "the panel stays gone after a reload");

		await page.clock.setSystemTime(start + 6 * DAY);
		await page.reload();
		await inboxLoaded(page);
		await expectNoPanel(page, "six days on, the panel is still gone");

		// Another browser of the same agent was never told Not now.
		const other = await operator.signInElsewhere("another browser", "default");
		await inboxLoaded(other.page);
		await expect(
			alertsPanel(other.page).getByText(COPY.ask, { exact: true }),
			"another browser still shows the panel",
		).toBeVisible();

		await page.clock.setSystemTime(start + 7 * DAY + 60_000);
		await page.reload();
		await inboxLoaded(page);
		await expect(
			panel.getByText(COPY.ask, { exact: true }),
			"seven days on, the panel is back",
		).toBeVisible();
		await expect(panel.getByRole("button", { name: COPY.turnOn })).toBeVisible();
		expect(await promptsOn(page), "and it asks the browser nothing on load").toBe(0);
	});
});

/* ---------------------------------------------------------------- Send test alert */

/** The operator's test alerts in the office's log. */
async function testAlertsOf(operator: Operator): Promise<string[]> {
	return (await alertState.alerts(operator.officeId))
		.filter((row) => row.userId === operator.id && row.kind === "test")
		.map((row) => row.id);
}

function sendTestAlert(api: Api) {
	return api.post("/api/alerts/devices/test");
}

// scenario: docs/e2e-scenarios.md Alerts 11 (ADR 0019 "Asking", #135)
test.describe("Alerts 11 — Send test alert", () => {
	test.describe.configure({ timeout: 120_000 });

	test("with a device on this session, This device says alerts are on; Send test alert logs one test alert and says it was sent; the API answers 202, and 401 signed out", async ({
		newOperator,
	}) => {
		const operator = await newOperator();
		const { page } = operator;
		await page.addInitScript(permissionStub, "granted" as Permission);
		await addDevice(operator.api, "the agent's browser");
		expect(await testAlertsOf(operator), "no test alert yet").toEqual([]);

		// Signed out, the API refuses.
		const anonymous = await apiAs();
		try {
			const signedOut = await sendTestAlert(anonymous);
			expect(signedOut.status(), "POST /api/alerts/devices/test signed out").toBe(401);
		} finally {
			await anonymous.dispose();
		}

		// Signed in with a device, the API takes it: one test alert, and none for the refused one.
		const accepted = await sendTestAlert(operator.api);
		expect(accepted.status(), `POST /api/alerts/devices/test (${await accepted.text()})`).toBe(202);
		await expect
			.poll(async () => (await testAlertsOf(operator)).length, {
				...ON_THE_PHONES,
				message: "the API's test alert, for the agent, and nothing signed out",
			})
			.toBe(1);

		// The same from Settings → Notifications.
		await page.goto("/en/settings/notifications");
		await expect(page, "Settings → Notifications opens").toHaveURL(/\/en\/settings\/notifications/);
		await expect(
			page.getByText(COPY.thisDevice, { exact: true }),
			"the This device row",
		).toBeVisible();
		await expect(page.getByText(COPY.on, { exact: true }), "alerts are on here").toBeVisible();
		await expect(page.getByRole("button", { name: COPY.turnOn })).toHaveCount(0);

		await page.getByRole("button", { name: COPY.sendTest }).click();
		await expect(
			page.getByText(COPY.sent, { exact: true }),
			"it says the alert was sent",
		).toBeVisible();
		await expect
			.poll(async () => (await testAlertsOf(operator)).length, {
				...ON_THE_PHONES,
				message: "Send test alert writes one more test alert for the agent",
			})
			.toBe(2);
	});

	test("with no device on this session, the API answers 409, nothing is sent, and This device offers to turn alerts on instead", async ({
		newOperator,
	}) => {
		const operator = await newOperator();
		// The agent has a device, but in their first browser: not on the session below.
		await addDevice(operator.api, "the agent's first browser");
		const other = await operator.signInElsewhere("a second browser", "granted");

		const refused = await sendTestAlert(other.api);
		expect(
			refused.status(),
			`POST /api/alerts/devices/test with no device on this session (${await refused.text()})`,
		).toBe(409);

		await other.page.goto("/en/settings/notifications");
		await expect(other.page, "Settings → Notifications opens").toHaveURL(
			/\/en\/settings\/notifications/,
		);
		await expect(
			other.page.getByText(COPY.thisDevice, { exact: true }),
			"the This device row",
		).toBeVisible();
		await expect(
			other.page.getByText(COPY.off, { exact: true }),
			"alerts are off for this device",
		).toBeVisible();
		await expect(
			other.page.getByRole("button", { name: COPY.turnOn }),
			"the row offers to turn alerts on",
		).toBeVisible();
		await expect(
			other.page.getByRole("button", { name: COPY.sendTest }),
			"and no Send test alert",
		).toHaveCount(0);

		expect(await testAlertsOf(operator), "the refused request wrote no test alert").toEqual([]);

		// The first browser's device takes a test alert: the log has that one, none from the 409.
		const accepted = await sendTestAlert(operator.api);
		expect(accepted.status(), "the first browser's session has a device").toBe(202);
		await expect
			.poll(async () => (await testAlertsOf(operator)).length, {
				...ON_THE_PHONES,
				message: "the first browser's test alert, and nothing for the refused one",
			})
			.toBe(1);
	});
});
