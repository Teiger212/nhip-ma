import { createHash, createHmac, randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { userIdOf, walkManager } from "./support/assign";
import { pipeCopy } from "./support/copy";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectWhatsAppNumber, connectZaloOa, releaseZaloOa } from "./support/pipes";
import { AGENT, DEMO_OFFICE_ID } from "./support/seed";
import { appOrigin, withOrigin } from "./support/session";
import { signInContext } from "./support/session-state";

const copy = pipeCopy("en");

/**
 * `newOa()` hands out a Zalo OA id of the test's own. Each is released after the test, even
 * one that failed or timed out, so no other spec ever finds its office's pipe disconnected.
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
/** The pipe's name as the inbox writes it. */
const ZALO = "Zalo";

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	const info = test.info();
	return `e2e-${kind}-${info.testId}-${info.repeatEachIndex}-${randomUUID().slice(0, 8)}`;
}

/** The E2E env's Zalo app (playwright.config.ts loads it); the webhook is signed with it. */
function zaloApp() {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	return { appId, secret };
}

/**
 * A guest writes to an OA: the webhook Zalo sends, signed as Zalo signs it. The app must take
 * it (a vendor retries anything else), so a message that does not show up was accepted and
 * then not filed, never refused at the door.
 */
async function guestWritesOnZalo(
	request: APIRequestContext,
	oaId: string,
	guestId: string,
	text: string,
) {
	const { appId, secret } = zaloApp();
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: "user_send_text",
		timestamp,
		sender: { id: guestId },
		recipient: { id: oaId },
		message: { text, msg_id: randomUUID() },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	const res = await request.post("/webhooks/zalo", {
		data: body,
		headers: {
			"content-type": "application/json",
			"X-ZEvent-Signature": `mac=${mac}`,
		},
	});
	expect(res.ok(), `the Zalo webhook takes the message (${res.status()})`).toBe(true);
}

/**
 * A guest writes to the office's WhatsApp number (the E2E env's pretend number): the webhook
 * Meta sends, signed as Meta signs it.
 */
async function guestWritesOnWhatsApp(
	request: APIRequestContext,
	guest: { id: string; name: string },
	text: string,
) {
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	const secret = process.env.WHATSAPP_APP_SECRET;
	if (!phoneNumberId || !secret) {
		throw new Error("WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_APP_SECRET come from the E2E env");
	}
	const body = JSON.stringify({
		entry: [
			{
				changes: [
					{
						value: {
							metadata: { phone_number_id: phoneNumberId },
							contacts: [{ wa_id: guest.id, profile: { name: guest.name } }],
							messages: [
								{
									from: guest.id,
									id: `wamid.${randomUUID()}`,
									timestamp: String(Math.floor(Date.now() / 1000)),
									type: "text",
									text: { body: text },
								},
							],
						},
					},
				],
			},
		],
	});
	const signature = createHmac("sha256", secret).update(body).digest("hex");
	const res = await request.post("/webhooks/whatsapp", {
		data: body,
		headers: {
			"content-type": "application/json",
			"X-Hub-Signature-256": `sha256=${signature}`,
		},
	});
	expect(res.ok(), `the WhatsApp webhook takes the message (${res.status()})`).toBe(true);
}

/** A WhatsApp guest no other test, repeat or earlier run uses (a wa_id is digits). */
function uniqueWhatsAppGuest() {
	const id = `8490${Date.now()}${Math.floor(Math.random() * 1e4)}`;
	return { id, name: `E2E WhatsApp ${id}` };
}

/** The inbox's entry for a guest, by name (a nameless Zalo guest is listed by their id). */
function threadOf(page: Page, guestId: string) {
	return page.getByRole("button", { name: new RegExp(`^${guestId}\\b`) });
}

/** The platform admin's Connections card for an office. */
async function openConnections(admin: Admin, officeId: string) {
	const page = await admin.openPage();
	await page.goto(`/en/admin/organizations/${officeId}`);
	await expect(page.getByTestId("office-connections")).toBeVisible();
	const row = (pipe: "zalo" | "whatsapp") => page.getByTestId(`connection-${pipe}`);
	return {
		zalo: row("zalo"),
		whatsapp: row("whatsapp"),
		status: (pipe: "zalo" | "whatsapp") => row(pipe).getByTestId("connection-status"),
		/** One Zalo OA of the office: its status, its id, its own Reconnect and Disconnect. */
		oa: (oaId: string) =>
			row("zalo")
				.getByTestId("connection-zalo-oa")
				.and(page.locator(`[data-oa-id="${oaId}"]`)),
	};
}

// scenario: docs/e2e-scenarios.md Pipe connections 1
test.describe("Pipes 1 — the platform admin starts connecting a Zalo OA", () => {
	test("Connections lists Zalo and WhatsApp as not connected, and Connect Zalo OA goes to Zalo's consent page for Nhịp's app", async ({
		admin,
	}) => {
		// An office of its own: nothing else ever connects a pipe to it.
		const office = await admin.createOffice("Pipes 1");
		const connections = await openConnections(admin, office.id);

		await expect(connections.zalo).toBeVisible();
		await expect(connections.whatsapp).toBeVisible();
		await expect(connections.status("zalo")).toHaveText(copy.status.none);
		await expect(connections.status("whatsapp")).toHaveText(copy.status.none);

		// Zalo's consent screen is Zalo's; the browser only has to get there.
		const page = await admin.openPage();
		await page.route("https://oauth.zaloapp.com/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<p>Zalo consent</p>",
			}),
		);
		const connect = connections.zalo.getByTestId("connect-zalo");
		await expect(connect).toHaveText(copy.connectZalo);
		const toZalo = page.waitForRequest((r) => r.url().startsWith("https://oauth.zaloapp.com/"));
		await connect.click();
		const consent = new URL((await toZalo).url());

		await expect(page).toHaveURL(/^https:\/\/oauth\.zaloapp\.com\/v4\/oa\/permission\?/);
		expect(consent.pathname).toBe("/v4/oa/permission");
		expect(consent.searchParams.get("app_id"), "Nhịp's Zalo app").toBe(zaloApp().appId);
		expect(consent.searchParams.get("redirect_uri"), "Nhịp's callback address").toBe(
			`${appOrigin()}/api/pipes/zalo/callback`,
		);
		expect(consent.searchParams.get("state"), "the attempt's state").toBeTruthy();
		expect(consent.searchParams.get("code_challenge"), "a PKCE challenge").toBeTruthy();
	});
});

// scenario: docs/e2e-scenarios.md Pipe connections 2
test.describe("Pipes 2 — only the platform admin connects", () => {
	const connectAddress = `/api/pipes/zalo/connect?officeId=${encodeURIComponent(DEMO_OFFICE_ID)}`;

	test("the agent sees no Connections for their own office, and asking for the connect address is refused: 403 as the agent, 401 signed out", async ({
		page,
		context,
		request,
	}) => {
		await signInContext(context, AGENT);

		await test.step("the agent sees no Connections for their own office", async () => {
			await page.goto(`/en/admin/organizations/${DEMO_OFFICE_ID}`);
			// Judge on a rendered page, not an empty one.
			await expect(page.getByRole("main")).toBeVisible();
			await expect(page.getByTestId("office-connections")).toHaveCount(0);
			await expect(page.getByTestId("connect-zalo")).toHaveCount(0);
		});

		await test.step("asking for the connect address is refused: 403 as the agent, 401 signed out", async () => {
			const asAgent = await context.request.get(connectAddress, {
				maxRedirects: 0,
			});
			expect(asAgent.status(), "the agent is refused").toBe(403);

			const signedOut = await request.get(connectAddress, {
				maxRedirects: 0,
			});
			expect(signedOut.status(), "nobody signed in is refused").toBe(401);
		});
	});
});

// scenario: docs/e2e-scenarios.md Pipe connections 3
test.describe("Pipes 3 — a disconnected pipe blocks its replies, and nothing else", () => {
	test("with one Zalo OA of the office disconnected, its thread cannot be sent (UI and API) and its guest's messages still arrive; another OA and WhatsApp still send; the admin sees Needs reconnect", async ({
		page,
		context,
		request,
		admin,
		newOa,
	}) => {
		// Three pipe set-ups and the manager's three assignments outlast the default 30 s under load.
		test.setTimeout(90_000);
		// The walk office, the agent's: one OA that breaks, one that stays connected, and the
		// office's WhatsApp number.
		const brokenOa = newOa();
		const workingOa = newOa();
		const guestId = uniqueId("guest");
		const otherGuestId = uniqueId("otherguest");
		const whatsappGuest = uniqueWhatsAppGuest();
		const first = `Hello from ${guestId}, first`;
		const second = `Hello from ${guestId}, second`;
		await signInContext(context, AGENT);
		const agent = withOrigin(page.request);

		// Setup, each trio at once: distinct OAs, then distinct guests.
		await Promise.all([
			connectZaloOa(DEMO_OFFICE_ID, brokenOa),
			connectZaloOa(DEMO_OFFICE_ID, workingOa),
			connectWhatsAppNumber(DEMO_OFFICE_ID),
		]);
		// The guests' threads exist while everything is connected; then one OA breaks.
		await Promise.all([
			guestWritesOnZalo(request, brokenOa, guestId, first),
			guestWritesOnZalo(request, workingOa, otherGuestId, `Hello from ${otherGuestId}`),
			guestWritesOnWhatsApp(request, whatsappGuest, `Hello from ${whatsappGuest.id}`),
		]);
		// The walk office's manager gives the three new guests to the agent (ADR 0022).
		const manager = await walkManager();
		try {
			const agentId = await userIdOf(agent);
			await Promise.all(
				[guestId, otherGuestId, whatsappGuest.id].map((guest) =>
					manager.assignGuestTo(guest, agentId),
				),
			);
		} finally {
			await manager.dispose();
		}
		// Only after every write above.
		await connectZaloOa(DEMO_OFFICE_ID, brokenOa, "disconnected");

		await page.goto("/en/inbox");
		await expect(page.getByTestId("pipe-disconnected-banner")).toHaveText(copy.banner(ZALO));

		// The broken OA's thread: the send button is disabled, with the reason.
		await threadOf(page, guestId).click();
		await expect(page.getByRole("article").getByText(first)).toBeVisible();
		await expect(page.getByTestId("approve-and-send")).toBeDisabled();
		await expect(page.getByTestId("send-status")).toHaveText(copy.sendBlocked(ZALO));

		// The API refuses the same reply.
		const listed = await agent.get("/api/conversations");
		expect(listed.status()).toBe(200);
		const threads = (await listed.json()) as {
			id: string;
			guestId: string;
			unansweredInboundId: string | null;
		}[];
		const zaloThread = threads.find((t) => t.guestId === guestId);
		expect(zaloThread?.unansweredInboundId, "the guest is waiting on a reply").toBeTruthy();
		const approve = await agent.post(
			`/api/conversations/${encodeURIComponent(zaloThread!.id)}/approve`,
			{
				inboundId: zaloThread!.unansweredInboundId,
				reply: "Thanks, we'll be in touch.",
			},
		);
		expect(approve.status(), "approving on a disconnected pipe is refused").toBe(409);
		expect(await approve.json()).toMatchObject({ error: "pipe_disconnected" });

		// A new guest message still arrives, in the same thread.
		await guestWritesOnZalo(request, brokenOa, guestId, second);
		await page.reload();
		await expect(threadOf(page, guestId)).toHaveCount(1);
		await threadOf(page, guestId).click();
		const thread = page.getByRole("article");
		await expect(thread.getByText(first)).toBeVisible();
		await expect(thread.getByText(second)).toBeVisible();

		// The office's other OA and its WhatsApp number still send.
		const queue = (label: "Your turn" | "Sent") =>
			page.getByRole("button", { name: new RegExp(`^${label} \\d+$`) });
		for (const [who, name] of [
			["a guest of the connected OA", otherGuestId],
			["a WhatsApp guest", whatsappGuest.name],
		] as const) {
			await queue("Your turn").click();
			await threadOf(page, name).click();
			const send = page.getByTestId("approve-and-send");
			await expect(send, `${who} can be answered`).toBeEnabled();
			const reply = `Reply to ${name}`;
			await page.getByRole("textbox", { name: "Reply" }).fill(reply);
			const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
			await send.click();
			expect((await sent).status(), `the reply to ${who} is sent`).toBe(200);
			// The thread is answered: it is under Sent, with the reply in it.
			await queue("Sent").click();
			await threadOf(page, name).click();
			// A sent message, not the reply box, which may still hold the text as it clears.
			await expect(
				page.getByRole("article").getByTestId("message").filter({ hasText: reply }),
			).toBeVisible();
		}

		// The platform admin sees which OA needs reconnecting, and that the other one is fine.
		const connections = await openConnections(admin, DEMO_OFFICE_ID);
		const broken = connections.oa(brokenOa);
		await expect(broken.getByTestId("connection-status")).toHaveText(copy.status.needsReconnect);
		await expect(broken.getByTestId("reconnect-zalo")).toBeVisible();
		await expect(connections.oa(workingOa).getByTestId("connection-status")).toHaveText(
			copy.status.connected,
		);
	});
});

// scenario: docs/e2e-scenarios.md Pipe connections 4
test.describe("Pipes 4 — disconnecting", () => {
	test("the platform admin disconnects the office's Zalo OA: Not connected, and new guest messages to it no longer reach the office", async ({
		admin,
		browser,
		request,
		newOa,
	}) => {
		// An office of its own with one manager, so its Connections show exactly this OA and
		// someone in the office sees whatever arrives, assigned or not (ADR 0022).
		const office = await admin.createOffice("Pipes 4");
		const oaId = newOa();
		const guestId = uniqueId("guest");
		const newGuestId = uniqueId("newguest");
		const before = `Hello from ${guestId}, before`;
		const after = `Hello from ${guestId}, after`;

		await connectZaloOa(office.id, oaId);
		let manager: Joined | undefined;
		try {
			manager = await joinOffice(admin, browser, office.id, "admin", "pipes-manager");
			// While connected, a guest's message reaches the office.
			await guestWritesOnZalo(request, oaId, guestId, before);
			await manager.page.goto("/en/inbox");
			await expect(threadOf(manager.page, guestId)).toBeVisible();

			const connections = await openConnections(admin, office.id);
			const oa = connections.oa(oaId);
			await expect(oa.getByTestId("connection-status")).toHaveText(copy.status.connected);
			await oa.getByTestId("disconnect-zalo").click();
			const confirm = (await admin.openPage()).getByRole("alertdialog", {
				name: copy.disconnectTitle,
			});
			await expect(confirm, "the confirmation names the OA").toContainText(oaId);
			await confirm.getByRole("button", { name: "Confirm" }).click();
			await expect(oa).toHaveCount(0);
			await expect(connections.status("zalo")).toHaveText(copy.status.none);

			// After it, neither the same guest nor a new one reaches the office.
			await guestWritesOnZalo(request, oaId, guestId, after);
			await guestWritesOnZalo(request, oaId, newGuestId, `Hello from ${newGuestId}`);
			await manager.page.reload();
			await expect(threadOf(manager.page, guestId), "the thread stays").toBeVisible();
			await threadOf(manager.page, guestId).click();
			const thread = manager.page.getByRole("article");
			await expect(thread.getByText(before)).toBeVisible();
			await expect(thread.getByText(after)).toHaveCount(0);
			await expect(threadOf(manager.page, newGuestId)).toHaveCount(0);
		} finally {
			await manager?.close();
		}
	});
});
