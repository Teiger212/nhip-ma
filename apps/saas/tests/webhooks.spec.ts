import { createHash, randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { AGENT } from "./support/seed";
import { apiAs } from "./support/session";
import { signInContext } from "./support/session-state";

/**
 * `newOa()` hands out a Zalo OA id of the test's own, released after the test even when it
 * failed, so no other spec finds it held.
 */
const test = base.extend<{ newOa: () => string }>({
	// oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
	newOa: async ({}, use) => {
		const oaIds: string[] = [];
		await use(() => {
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			return oaId;
		});
		for (const oaId of oaIds) {
			await releaseZaloOa(oaId);
		}
	},
});

/** What the badge of each outcome says (English), as the scenario words it. */
const OUTCOME = {
	filed: (office: string) => `Filed to ${office}`,
	dropped: "Dropped: no office holds this number or OA",
	refused: "Refused: bad signature",
};

const DELIVERIES_API = "/api/pipes/deliveries";

/**
 * An id no other test, repeat or earlier run uses. Each is random on its own, so no id shown
 * in the log (message, OA) ever contains a guest id or a message's text by accident.
 */
function uniqueId(kind: string): string {
	return `e2e-${kind}-${randomUUID()}`;
}

/** A guest's message on Zalo: who wrote, to which OA, what, and Zalo's id for it. */
type ZaloMessage = { oaId: string; guestId: string; text: string; msgId: string };

function zaloMessage(oaId: string): ZaloMessage {
	return {
		oaId,
		guestId: uniqueId("guest"),
		text: `Hello, ${uniqueId("text")}`,
		msgId: uniqueId("msg"),
	};
}

/**
 * The webhook Zalo sends for a guest's text, signed as Zalo signs it (the E2E env's app and
 * secret) or, with `signed: false`, not signed at all. Answers the app's status.
 */
async function sendZaloWebhook(
	request: APIRequestContext,
	message: ZaloMessage,
	{ signed }: { signed: boolean },
): Promise<number> {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: "user_send_text",
		timestamp,
		sender: { id: message.guestId },
		recipient: { id: message.oaId },
		message: { text: message.text, msg_id: message.msgId },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	const res = await request.post("/webhooks/zalo", {
		data: body,
		headers: {
			"content-type": "application/json",
			...(signed ? { "X-ZEvent-Signature": `mac=${mac}` } : {}),
		},
	});
	return res.status();
}

/** A delivery as the page lists it, in the page's order. */
type ListedDelivery = { outcome: string | null; badge: string; text: string };

/** Every delivery the page lists right now, top to bottom. */
async function listedDeliveries(page: Page): Promise<ListedDelivery[]> {
	return page.getByTestId("webhook-delivery").evaluateAll((items) =>
		items.map((item) => ({
			outcome: item.getAttribute("data-outcome"),
			badge:
				item.querySelector('[data-test="webhook-delivery-outcome"]')?.textContent?.trim() ?? "",
			text: item.textContent ?? "",
		})),
	);
}

/** What a delivery says of the endpoint it came to (admin.webhooks.endpoint). */
function endpointOf(oaId: string): string {
	return `to ${oaId}`;
}

/**
 * The listed delivery that came to this OA. The log never shows the vendor's message id as sent
 * (#141), so a delivery is known by its endpoint: each signed delivery of a test goes to an OA
 * id no other delivery uses.
 */
function deliveryTo(page: Page, oaId: string) {
	return page.getByTestId("webhook-delivery").filter({ hasText: endpointOf(oaId) });
}

/**
 * Three deliveries of this test, in this order: a signed message to an OA the office holds
 * (filed), a signed one to an OA no office holds (dropped), an unsigned one (refused), and a
 * last signed one after it, to an OA of its own. The refused delivery carries no id of ours
 * (nothing unsigned is trusted), so it is known by where it sits: between the dropped one and the
 * last one.
 */
async function sendTheDeliveries(admin: Admin, request: APIRequestContext, newOa: () => string) {
	const office = await admin.createOffice("Delivery log");
	const heldOa = newOa();
	await connectZaloOa(office.id, heldOa);

	const filed = zaloMessage(heldOa);
	const dropped = zaloMessage(uniqueId("no-office-oa"));
	const refused = zaloMessage(heldOa);
	const last = zaloMessage(uniqueId("no-office-oa"));

	expect(await sendZaloWebhook(request, filed, { signed: true }), "a signed webhook is taken").toBe(
		200,
	);
	expect(
		await sendZaloWebhook(request, dropped, { signed: true }),
		"a signed webhook to an OA no office holds is taken too",
	).toBe(200);
	expect(
		await sendZaloWebhook(request, refused, { signed: false }),
		"an unsigned webhook is refused",
	).toBe(403);
	expect(await sendZaloWebhook(request, last, { signed: true })).toBe(200);

	return { office, heldOa, filed, dropped, refused, last };
}

// scenario: docs/e2e-scenarios.md Webhook deliveries 1
test.describe("Webhook deliveries 1 — every delivery is on record", () => {
	test("Admin → Webhooks lists a signed message to a held OA as filed to its office, one to an OA no office holds as dropped, an unsigned one as refused, newest first", async ({
		admin,
		request,
		newOa,
	}) => {
		const { office, heldOa, dropped, last } = await sendTheDeliveries(admin, request, newOa);
		const { page } = admin;

		// Admin → Webhooks, through the admin menu.
		await page.goto("/en/admin/organizations");
		const menuItem = page.getByRole("link", { name: "Webhooks", exact: true });
		await expect(menuItem, "the admin menu has Webhooks").toBeVisible();
		await menuItem.click();
		await expect(page).toHaveURL(/\/en\/admin\/webhooks/);
		await expect(page.getByTestId("webhook-deliveries")).toBeVisible();

		// Filed: on the OA the office holds, to that office.
		const filedItem = deliveryTo(page, heldOa);
		await expect(filedItem).toHaveCount(1);
		await expect(filedItem).toHaveAttribute("data-outcome", "filed");
		await expect(filedItem.getByTestId("webhook-delivery-outcome")).toHaveText(
			OUTCOME.filed(office.name),
		);

		// Dropped: no office holds the OA it came to.
		const droppedItem = deliveryTo(page, dropped.oaId);
		await expect(droppedItem).toHaveCount(1);
		await expect(droppedItem).toHaveAttribute("data-outcome", "dropped");
		await expect(droppedItem.getByTestId("webhook-delivery-outcome")).toHaveText(OUTCOME.dropped);
		await expect(deliveryTo(page, last.oaId)).toHaveCount(1);

		// Newest first, and the unsigned one is on record as refused, where it came in.
		await expect(async () => {
			const listed = await listedDeliveries(page);
			const at = (oaId: string) => listed.findIndex((d) => d.text.includes(endpointOf(oaId)));
			const [lastAt, droppedAt, filedAt] = [at(last.oaId), at(dropped.oaId), at(heldOa)];
			expect(lastAt, "the last delivery is listed").toBeGreaterThanOrEqual(0);
			expect(lastAt, "the last delivery is above the dropped one").toBeLessThan(droppedAt);
			expect(droppedAt, "the dropped delivery is above the filed one").toBeLessThan(filedAt);
			const between = listed.slice(lastAt + 1, droppedAt);
			expect(
				between.filter((d) => d.outcome === "refused" && d.badge === OUTCOME.refused),
				"the unsigned delivery, between the dropped one and the last, is refused (bad signature)",
			).not.toHaveLength(0);
		}).toPass({ timeout: 10_000 });
	});
});

// scenario: docs/e2e-scenarios.md Webhook deliveries 2
test.describe("Webhook deliveries 2 — no guest data in the log", () => {
	test("neither the page nor its API shows a message's text, the guest's id or the vendor's message id, signed or not", async ({
		admin,
		request,
		newOa,
	}) => {
		const { heldOa, filed, dropped, refused, last } = await sendTheDeliveries(
			admin,
			request,
			newOa,
		);
		const guestData = [filed, dropped, refused, last].flatMap((m) => [
			["guest id", m.guestId],
			["message text", m.text],
			["vendor message id as sent", m.msgId],
		]);
		const { page } = admin;

		await page.goto("/en/admin/webhooks");
		// Judge the page with this test's deliveries on it, not an empty one.
		await expect(deliveryTo(page, heldOa)).toHaveCount(1);
		await expect(deliveryTo(page, dropped.oaId)).toHaveCount(1);
		const html = await page.content();
		for (const [what, value] of guestData) {
			expect(html, `the page shows no ${what}`).not.toContain(value);
			await expect(page.getByText(value)).toHaveCount(0);
		}

		const res = await admin.api.get(DELIVERIES_API);
		expect(res.status()).toBe(200);
		const body = await res.text();
		expect(body, "the API lists this test's delivery, by its endpoint").toContain(heldOa);
		for (const [what, value] of guestData) {
			expect(body, `the API gives no ${what}`).not.toContain(value);
		}
	});
});

// scenario: docs/e2e-scenarios.md Webhook deliveries 3
test.describe("Webhook deliveries 3 — only the platform admin sees it", () => {
	test("the agent has no Webhooks page and no Webhooks menu item; the platform admin does", async ({
		page,
		context,
		admin,
	}) => {
		// The platform admin: the page is there (so its absence below means something).
		await admin.page.goto("/en/admin/webhooks");
		await expect(admin.page.getByTestId("webhook-deliveries")).toBeVisible();
		await expect(admin.page.getByRole("link", { name: "Webhooks", exact: true })).toBeVisible();

		await signInContext(context, AGENT);
		await page.goto("/en/admin/webhooks");
		// Judge on a rendered page, not an empty one.
		await expect(page.getByRole("main")).toBeVisible();
		await expect(page).not.toHaveURL(/\/admin\/webhooks/);
		await expect(page.getByTestId("webhook-deliveries")).toHaveCount(0);
		await expect(page.getByTestId("webhook-delivery")).toHaveCount(0);
		await expect(page.getByRole("link", { name: "Webhooks", exact: true })).toHaveCount(0);
	});

	test("the deliveries API refuses the agent (403) and a visitor signed out (401), and answers the platform admin", async ({
		admin,
	}) => {
		const asAdmin = await admin.api.get(DELIVERIES_API);
		expect(asAdmin.status(), "the platform admin reads the log").toBe(200);

		const agent = await apiAs(AGENT);
		const signedOut = await apiAs();
		try {
			expect((await agent.get(DELIVERIES_API)).status(), "the agent is refused").toBe(403);
			expect((await signedOut.get(DELIVERIES_API)).status(), "nobody signed in is refused").toBe(
				401,
			);
		} finally {
			await agent.dispose();
			await signedOut.dispose();
		}
	});
});
