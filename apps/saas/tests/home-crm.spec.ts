import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import type { MockCrmLead } from "./support/crm";
import {
	addZaloIdInMockCrm,
	bringMockCrmBack,
	connectMockCrm,
	markInMockCrm,
	mockCrmLeads,
	takeMockCrmDown,
} from "./support/crm";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectWhatsAppNumber, connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { newWhatsAppGuest, newWhatsAppNumber, sendWhatsAppText } from "./support/whatsapp";
import { sendZaloText } from "./support/zalo";

/**
 * A page learns of a change when it asks again: every second in the E2E build (#222). The
 * ceiling stays three production polls, for CI's margin.
 */
const WITHIN_A_POLL = { timeout: 30_000 };

/** What Home says in a Closings or Lost cell of an office with no CRM (#68). */
const NO_CRM = "No CRM";
const NO_CRM_HINT = "Closings and lost come from your CRM. Nhịp connects the one your office uses.";
/** The call to connect a CRM that Home never makes (#68): Nhịp connects it, not the office. */
const CONNECT_YOUR_CRM = /connect your CRM/i;

/** A Zalo guest of this test: their Zalo user id, which is also the name they go by. */
type Guest = { id: string };

/** An office of the test's own, its Zalo OA, its WhatsApp number and its invited manager. */
type HomeOffice = {
	id: string;
	/** The office's Zalo OA, an id no other test uses. */
	oaId: string;
	/** The office's WhatsApp number (its phone_number_id), one no other test uses. */
	phoneNumberId: string;
	/** The office's manager (the kit's `admin`), who sees every thread of the office. */
	manager: Joined;
};

/**
 * `newOffice` makes an office of the test's own (the platform admin creates it; it is deleted
 * afterwards) on the mock CRM or on none, with a Zalo OA (released afterwards) and a WhatsApp
 * number of its own, and an invited manager. No other spec writes to it, so its leads and
 * outcomes are this test's only.
 */
const test = base.extend<{
	newOffice: (label: string, options: { crm: "mock" | "none" }) => Promise<HomeOffice>;
}>({
	newOffice: async ({ admin, browser }, use) => {
		const oaIds: string[] = [];
		const managers: Joined[] = [];
		await use(async (label, { crm }) => {
			const office = await admin.createOffice(label);
			// Before any guest writes: connecting the mock CRM drops the office's links to leads.
			if (crm === "mock") {
				await connectMockCrm(office.id);
			}
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			await connectZaloOa(office.id, oaId);
			const phoneNumberId = newWhatsAppNumber("home-crm");
			await connectWhatsAppNumber(office.id, phoneNumberId);
			const manager = await joinOffice(admin, browser, office.id, "admin", "home-crm-manager");
			managers.push(manager);
			return { id: office.id, oaId, phoneNumberId, manager };
		});
		for (const manager of managers) {
			await manager.close();
		}
		for (const oaId of oaIds) {
			await releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-home-crm-${kind}-${randomUUID()}`;
}

function newGuest(): Guest {
	return { id: uniqueId("guest") };
}

/** The guest writes to an OA, as Zalo delivers it; resolves with the text, which is theirs alone. */
async function writes(request: APIRequestContext, guest: Guest, oaId: string): Promise<string> {
	const text = `Hello from ${guest.id} to ${oaId.slice(-8)}, ${randomUUID().slice(0, 8)}`;
	await sendZaloText(request, { guestId: guest.id, oaId, text });
	return text;
}

/* ---------------------------------------------------------------- in the CRM itself */

/** The office's lead that `matches`, once the CRM holds it. */
async function leadWhere(
	officeId: string,
	matches: (lead: MockCrmLead) => boolean,
	message: string,
): Promise<MockCrmLead> {
	await expect
		.poll(async () => (await mockCrmLeads(officeId)).filter(matches).length, {
			message,
			timeout: 30_000,
		})
		.toBeGreaterThan(0);
	return (await mockCrmLeads(officeId)).filter(matches)[0];
}

/** The Zalo guest's lead in the office's CRM, once it is there. */
function leadOf(officeId: string, guest: Guest): Promise<MockCrmLead> {
	return leadWhere(
		officeId,
		(lead) => lead.zaloUserId === guest.id,
		`${guest.id} becomes a lead in the CRM`,
	);
}

/** The office marks the lead in its CRM, and the CRM tells Nhịp, which takes the notice. */
async function markLead(
	request: APIRequestContext,
	officeId: string,
	lead: MockCrmLead,
	outcome: "won" | "lost",
) {
	const status = await markInMockCrm(request, officeId, lead.id, outcome);
	expect(
		status,
		`Nhịp takes the CRM's notice that the lead is ${outcome} (${status})`,
	).toBeLessThan(300);
}

/* ---------------------------------------------------------------- what a person sees */

/**
 * The thread of a guest (by their id on the pipe: a Zalo user id, a WhatsApp phone), as the
 * manager's conversations API lists it, once it is there.
 */
async function threadOf(api: Api, guestId: string): Promise<string> {
	let ids: string[] = [];
	await expect(async () => {
		const res = await api.get("/api/conversations");
		expect(res.status(), "the manager lists the office's threads").toBe(200);
		ids = ((await res.json()) as { id: string; guestId: string }[])
			.filter((t) => t.guestId === guestId)
			.map((t) => t.id);
		expect(ids, `the manager lists one thread of ${guestId}`).toHaveLength(1);
	}).toPass(WITHIN_A_POLL);
	return ids[0];
}

/** The open thread, its header included. */
function openThread(page: Page) {
	return page.getByRole("article");
}

/**
 * The manager opens a thread by its link (the Unassigned view lists it, but the link names it
 * exactly), and it is that thread: the message written there shows in it.
 */
async function openThreadById(page: Page, threadId: string, text: string) {
	await page.goto(`/en/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(
		openThread(page).getByText(text, { exact: true }),
		"the thread opened is the one written on",
	).toBeVisible();
}

/**
 * The open thread's header says the guest is in the CRM: the thread is on a lead. Judged by "In
 * CRM" only, not the name after it: the person goes by another name on each pipe, and which one
 * the header shows is not the point here.
 */
async function expectInCrm(page: Page, which: string) {
	await expect(openThread(page).getByTestId("crm-status"), `${which} says In CRM`).toHaveText(
		/^In CRM\b/,
		WITHIN_A_POLL,
	);
}

/** The open thread's status (where the turn was) says the CRM's outcome. */
async function expectOutcome(page: Page, outcome: "Won" | "Lost", which: string) {
	await expect(
		openThread(page).getByTestId("thread-status"),
		`${which} says ${outcome}`,
	).toHaveText(outcome, WITHIN_A_POLL);
}

/** The person opens Home; it answers, and it has rendered. */
async function openHome(page: Page) {
	const res = await page.goto("/en/home");
	expect(res?.status() ?? 0, "Home answers").toBeLessThan(400);
	await expect(
		page.getByRole("heading", { name: "Waiting now" }),
		"Home has rendered",
	).toBeVisible();
}

/** Home's Closings and Lost cells. */
function closingsCell(page: Page) {
	return page.getByTestId("home-closings");
}
function lostCell(page: Page) {
	return page.getByTestId("home-lost");
}

/**
 * A cell of an office on a CRM: its figure, and a line saying when Nhịp last heard from the CRM.
 * The figure is the only digit-only text in the cell, so a cell counting 2 fails as much as one
 * with no figure.
 */
async function expectCounted(page: Page, name: string, testId: string, figure: number) {
	const cell = page.getByTestId(testId);
	await expect(cell, `Home shows ${name}`).toBeVisible();
	await expect(cell.getByText(/^\d+$/), `${name} counts ${figure}`).toHaveText([String(figure)]);
	await expect(
		cell.getByText(/^As of \S/),
		`${name} says as of when Nhịp last heard from the CRM`,
	).toBeVisible();
	await expect(cell.getByText(NO_CRM, { exact: true }), `${name} has no "No CRM"`).toHaveCount(0);
}

/** A cell of an office with no CRM: "No CRM" and where the numbers come from, and no figure. */
async function expectNoCrm(page: Page, name: string, testId: string) {
	const cell = page.getByTestId(testId);
	await expect(cell, `Home shows ${name}`).toBeVisible();
	await expect(cell.getByText(NO_CRM, { exact: true }), `${name} says No CRM`).toBeVisible();
	await expect(
		cell.getByText(NO_CRM_HINT, { exact: true }),
		`${name} says where closings and lost come from`,
	).toBeVisible();
	await expect(cell.getByText(/^\d+$/), `${name} shows no figure`).toHaveCount(0);
	await expect(cell.getByText(/^As of /), `${name} has no "As of" line`).toHaveCount(0);
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md CRM 6
test.describe("CRM 6 — Home counts deals from the CRM", () => {
	test("Home shows Closings and Lost as of the last time Nhịp heard from the CRM, and two threads on one won lead count one closing", async ({
		newOffice,
		request,
	}) => {
		test.setTimeout(240_000);
		const office = await newOffice("Home CRM counts", { crm: "mock" });
		const { page, api } = office.manager;

		// One person reached on two pipes (spec #59, story 31). They write on WhatsApp first and
		// become a lead, with their phone.
		const onWhatsApp = newWhatsAppGuest();
		const whatsAppText = `Hello, is the flat still free? ${onWhatsApp.name}`;
		await sendWhatsAppText(request, {
			phoneNumberId: office.phoneNumberId,
			guest: onWhatsApp,
			text: whatsAppText,
		});
		const lead = await leadWhere(
			office.id,
			(l) => l.phone === `+${onWhatsApp.phone}`,
			"the WhatsApp guest becomes a lead in the CRM, with their phone",
		);

		// In the CRM itself, the manager adds the person's Zalo user id to that lead, as they would
		// edit the contact in HubSpot. The same person then writes on Zalo: a second thread, which
		// Nhịp finds on the same lead by the Zalo user id.
		const onZalo = newGuest();
		await addZaloIdInMockCrm(office.id, lead.id, onZalo.id);
		const zaloText = await writes(request, onZalo, office.oaId);

		// Two threads, one per pipe, each on a lead.
		const threads = [
			{ pipe: "WhatsApp", id: await threadOf(api, onWhatsApp.phone), text: whatsAppText },
			{ pipe: "Zalo", id: await threadOf(api, onZalo.id), text: zaloText },
		];
		for (const thread of threads) {
			await openThreadById(page, thread.id, thread.text);
			await expectInCrm(page, `the person's ${thread.pipe} thread`);
		}
		// Judged once both threads are on a lead, so no second lead is still on its way.
		expect(
			(await mockCrmLeads(office.id)).map((l) => l.id),
			"both threads are on the one lead: the CRM holds no other",
		).toEqual([lead.id]);

		// Another guest becomes a lead, which the office marks lost; then the first person's lead
		// is won.
		const other = newGuest();
		const otherText = await writes(request, other, office.oaId);
		const otherLead = await leadOf(office.id, other);
		await markLead(request, office.id, otherLead, "lost");
		await markLead(request, office.id, lead, "won");

		// Nhịp has heard: both of the person's threads say Won, the other guest's says Lost.
		for (const thread of threads) {
			await openThreadById(page, thread.id, thread.text);
			await expectOutcome(page, "Won", `the person's ${thread.pipe} thread`);
		}
		const otherThread = await threadOf(api, other.id);
		await openThreadById(page, otherThread, otherText);
		await expectOutcome(page, "Lost", "the other guest's thread");

		// Home: one closing (one lead, though on two threads) and one lost, each as of the last
		// time Nhịp heard from the CRM, and no "No CRM".
		await openHome(page);
		await expectCounted(page, "Closings", "home-closings", 1);
		await expectCounted(page, "Lost", "home-lost", 1);
		await expect(
			page.getByText(NO_CRM, { exact: true }),
			"an office on a CRM is never told it has none",
		).toHaveCount(0);
	});

	test("with the CRM failing, Home loads with the cached Closings and its As of line, and no error", async ({
		newOffice,
		request,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice("Home CRM down", { crm: "mock" });
		const { page, api } = office.manager;

		// A guest becomes a lead, which the office marks won, and Nhịp has heard it.
		const guest = newGuest();
		const text = await writes(request, guest, office.oaId);
		const lead = await leadOf(office.id, guest);
		await markLead(request, office.id, lead, "won");
		const thread = await threadOf(api, guest.id);
		await openThreadById(page, thread, text);
		await expectOutcome(page, "Won", "the guest's thread");

		// The CRM fails; Home still shows what Nhịp last heard, without waiting on it.
		await takeMockCrmDown(office.id);
		try {
			await openHome(page);
			await expectCounted(page, "Closings", "home-closings", 1);
			await expect(
				closingsCell(page).getByText(/error|failed|unavailable|try again/i),
				"Closings shows no error",
			).toHaveCount(0);
			await expect(
				lostCell(page).getByText(/error|failed|unavailable|try again/i),
				"Lost shows no error",
			).toHaveCount(0);
		} finally {
			await bringMockCrmBack(office.id);
		}
	});

	test("an office with no CRM shows No CRM and where the numbers come from in Closings and Lost, no figure there, and never a call to connect a CRM", async ({
		newOffice,
	}) => {
		test.setTimeout(120_000);
		const office = await newOffice("Home CRM none", { crm: "none" });
		const { page } = office.manager;

		await openHome(page);
		// Nhịp connects the office's CRM; Home never asks the office to.
		await expect
			.soft(page.getByText(CONNECT_YOUR_CRM), "nowhere on Home a call to connect a CRM")
			.toHaveCount(0);
		await expect
			.soft(page.getByRole("link", { name: CONNECT_YOUR_CRM }), "no link to connect one")
			.toHaveCount(0);
		await expect
			.soft(page.getByRole("button", { name: CONNECT_YOUR_CRM }), "no button to connect one")
			.toHaveCount(0);
		await expectNoCrm(page, "Closings", "home-closings");
		await expectNoCrm(page, "Lost", "home-lost");
	});
});
