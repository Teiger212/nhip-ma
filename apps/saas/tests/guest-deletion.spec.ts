import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { ownerCopy } from "./support/copy";
import { mockCrmLeads } from "./support/crm";
import type { GuestDeletionReceipt } from "./support/deletion";
import { guestDeletionRecords, holdReplySending } from "./support/deletion";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { MANAGER, PLATFORM_ADMIN } from "./support/seed";
import type { Api } from "./support/session";
import { apiAs, withOrigin } from "./support/session";
import { sendZaloText } from "./support/zalo";

/**
 * The deletion's copy (inbox.deletion), the Inbox's search, and Home's labels, from
 * packages/i18n/translations/en/saas.json.
 */
const saas = JSON.parse(
	fs.readFileSync(
		path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json"),
		"utf8",
	),
) as {
	inbox: {
		searchAria: string;
		yourTurn: string;
		deletion: {
			actions: string;
			delete: string;
			sendingReason: string;
			title: string;
			what: string;
			keptZalo: string;
			irreversible: string;
			cancel: string;
			confirm: string;
			done: string;
			reasonLabel: string;
			reasons: Record<Reason, string>;
			noteLabel: string;
			noteOptional: string;
			noteHint: string;
			noteRequired: string;
		};
	};
	home: {
		window: string;
		waitingNow: string;
		responseTime: string;
		funnel: { title: string; leadsIn: string; engaged: string; inConversation: string };
		spread: { label: string; under5m: string };
	};
};

const deletionCopy = {
	...saas.inbox.deletion,
	title: (name: string) => saas.inbox.deletion.title.replaceAll("{name}", name),
	what: (count: number) => plural(saas.inbox.deletion.what, count),
};
const homeCopy = saas.home;

/** Why a manager deletes a guest's data: one of a short list, always given. */
type Reason = GuestDeletionReceipt["reason"];
const REASONS: readonly Reason[] = ["guest_request", "duplicate_or_spam", "test_data", "other"];

/** An ICU `{count, plural, one {…} other {…}}` rendered for `count`, as the app shows it. */
function plural(template: string, count: number): string {
	return template.replace(
		/\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/,
		(_, one: string, other: string) => (count === 1 ? one : other).replaceAll("#", String(count)),
	);
}

/**
 * A page learns of a change when it asks again, which the Inbox does about every ten seconds;
 * a change gets three of those rounds to show.
 */
const WITHIN_A_POLL = { timeout: 30_000 };

/** A guest of this test, writing on Zalo to the office's OA; a nameless Zalo guest goes by their id. */
type Guest = {
	id: string;
	/** Every text the guest sent, in order. */
	texts: string[];
	/** The guest writes (again); resolves with the text. */
	write: (text?: string) => Promise<string>;
};

/** An operator of the office, signed in in a browser of their own. */
type Operator = {
	/** How the test speaks of them. */
	label: string;
	/** Their account's id and name, as their own session tells them. */
	id: string;
	name: string;
	page: Page;
	api: Api;
};

/**
 * An office of the test's own with no CRM (the platform admin creates it, so the admin is its kit
 * `owner`; it is deleted afterwards), a Zalo OA of its own (released afterwards), and an agent and a
 * manager (the kit's `admin`) who accepted their invitations into it. No other spec writes
 * to it, so its counts are this test's.
 */
type DeletionOffice = {
	id: string;
	agent: Operator;
	manager: Operator;
	/** A new guest writes to the office for the first time. */
	newGuest: () => Promise<Guest>;
	/**
	 * The manager gives the guest's thread to the agent, through the owner API (ADR 0022): a new
	 * guest waits in Unassigned, which the agent doesn't see, until then.
	 */
	assignToAgent: (guest: Guest) => Promise<void>;
};

const test = base.extend<{ newOffice: (label: string) => Promise<DeletionOffice> }>({
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: { close: () => Promise<void> }[] = [];
		await use(async (label) => {
			const office = await admin.createOffice(label);
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			await connectZaloOa(office.id, oaId);
			const agent = await newOperatorOf(admin, browser, office.id, "the agent", "member");
			contexts.push(agent);
			const manager = await newOperatorOf(admin, browser, office.id, "the manager", "admin");
			contexts.push(manager);
			const assigner = assignerAs(manager.api);
			return {
				id: office.id,
				agent,
				manager,
				newGuest: async () => {
					const guest = guestOf(request, oaId);
					await guest.write();
					return guest;
				},
				assignToAgent: (guest) => assigner.assignGuestTo(guest.id, agent.id),
			};
		});
		for (const context of contexts) {
			await context.close();
		}
		for (const oaId of oaIds) {
			await releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-deletion-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	const guest: Guest = {
		id,
		texts: [],
		write: async (text = `Hello from ${id}, ${randomUUID().slice(0, 8)}`) => {
			await sendZaloText(request, { guestId: id, oaId, text });
			guest.texts.push(text);
			return text;
		},
	};
	return guest;
}

/** A newly joined operator of `officeId`: an agent (the kit's `member`) or a manager (`admin`). */
async function newOperatorOf(
	admin: Admin,
	browser: Browser,
	officeId: string,
	label: string,
	role: "member" | "admin",
): Promise<Operator & { close: () => Promise<void> }> {
	const { page, api, close } = await joinOffice(
		admin,
		browser,
		officeId,
		role,
		role === "admin" ? "deletion-manager" : "deletion-agent",
	);
	const session = await api.get("/api/auth/get-session");
	expect(session.status(), `${label}'s session is readable`).toBe(200);
	const { user } = (await session.json()) as { user: { id: string; name: string } };
	return { label, id: user.id, name: user.name, page, api, close };
}

/* ---------------------------------------------------------------- through the API */

type ListedThread = { id: string; guestId: string; unansweredInboundId: string | null };

function threadAddress(threadId: string) {
	return `/api/conversations/${encodeURIComponent(threadId)}`;
}

function deletionAddress(threadId: string) {
	return `${threadAddress(threadId)}/deletion`;
}

/**
 * The guest's thread as this operator's conversations API lists it, once it is there (and, when
 * `waiting`, once a message of theirs waits on a reply).
 */
async function threadSeenBy(
	operator: Operator,
	guest: Guest,
	{ waiting = false } = {},
): Promise<ListedThread> {
	let thread: ListedThread | undefined;
	await expect(async () => {
		const res = await operator.api.get("/api/conversations");
		expect(res.status()).toBe(200);
		thread = ((await res.json()) as ListedThread[]).find((t) => t.guestId === guest.id);
		expect(thread, `${operator.label} lists ${guest.id}`).toBeDefined();
		if (waiting) {
			expect(thread?.unansweredInboundId, `${guest.id} waits on a reply`).toBeTruthy();
		}
	}).toPass({ timeout: 10_000 });
	return thread!;
}

/**
 * The office has greeted the guest: a new guest's first message gets the auto-reply (ADR 0021),
 * so the thread holds an office message before anyone answers.
 */
async function greeted(operator: Operator, guest: Guest): Promise<void> {
	const { id } = await threadSeenBy(operator, guest);
	await expect(async () => {
		const res = await operator.api.get(threadAddress(id));
		expect(res.status()).toBe(200);
		const { messages } = (await res.json()) as { messages: { direction: string }[] };
		expect(
			messages.some((message) => message.direction === "out"),
			`the office greets ${guest.id}`,
		).toBe(true);
	}).toPass({ timeout: 20_000 });
}

/**
 * The agent answers the guest's waiting message in Nhịp (setup; the guest must be assigned to
 * them), once the office's auto-reply has gone out, so every thread holds it before the reply.
 */
async function answer(agent: Operator, guest: Guest): Promise<string> {
	await greeted(agent, guest);
	const thread = await threadSeenBy(agent, guest, { waiting: true });
	const reply = `Reply to ${guest.id}, ${randomUUID().slice(0, 8)}`;
	const res = await agent.api.post(`${threadAddress(thread.id)}/approve`, {
		inboundId: thread.unansweredInboundId,
		reply,
	});
	expect(res.status(), `${agent.label} answers ${guest.id}`).toBe(200);
	return reply;
}

/** The thread is gone for this operator: its address answers 404 and their list omits it. */
async function expectGoneThroughApi(operator: Operator, guest: Guest, threadId: string) {
	const opened = await operator.api.get(threadAddress(threadId));
	expect(opened.status(), `${operator.label} opening the deleted thread finds nothing`).toBe(404);
	const listed = await operator.api.get("/api/conversations");
	expect(listed.status()).toBe(200);
	expect(
		((await listed.json()) as ListedThread[]).map((t) => t.guestId),
		`${operator.label}'s conversations do not list ${guest.id}`,
	).not.toContain(guest.id);
}

/* ---------------------------------------------------------------- the Inbox */

function threadList(page: Page) {
	return page.getByRole("complementary");
}

/** The open thread, its header included. */
function openThread(page: Page) {
	return page.getByRole("article");
}

function rowOf(page: Page, guest: Guest) {
	return threadList(page).getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });
}

type ViewName = "Unassigned" | "Your turn" | "Sent" | "All";
const VIEWS: readonly ViewName[] = ["Your turn", "Sent", "All"];

/** The views the person's Inbox shows: a manager's start with Unassigned (ADR 0022). */
async function viewsOf(page: Page): Promise<readonly ViewName[]> {
	return (await view(page, "Unassigned").count()) > 0 ? ["Unassigned", ...VIEWS] : VIEWS;
}

/** A view button of the Inbox with its count (any count when none is given). */
function view(page: Page, name: ViewName, count?: number) {
	return page.getByRole("button", {
		name: count === undefined ? new RegExp(`^${name} \\d+$`) : `${name} ${count}`,
		exact: count !== undefined,
	});
}

/** The amber number beside Inbox in the sidebar. */
function navCount(page: Page) {
	return page.getByRole("link", { name: /^Inbox\b/ }).getByTestId("nav-your-turn-count");
}

/** The Inbox, with its threads loaded (a row, or the empty Inbox saying so). */
async function openInbox(page: Page) {
	await page.goto("/en/inbox");
	await expect(
		// A row (it carries its owner flag), or the list saying it is empty, caught up, unmatched,
		// or that every lead is assigned (a manager's Unassigned, ADR 0022).
		// The view buttons above the list are buttons too, so a button proves nothing.
		threadList(page)
			.locator(
				'[data-test="thread-owner"], [data-test="inbox-empty"], [data-test="inbox-caught-up"], [data-test="inbox-no-matches"], [data-test="inbox-all-assigned"]',
			)
			// A Quiet row sits folded away until opened, so only a shown one counts.
			.filter({ visible: true })
			.first(),
	).toBeVisible();
}

async function showView(page: Page, name: ViewName) {
	await view(page, name).click();
	await expect(view(page, name)).toHaveAttribute("aria-pressed", "true");
}

async function search(page: Page, text: string) {
	await page.getByRole("textbox", { name: saas.inbox.searchAria }).fill(text);
}

/** The operator opens the Inbox and, in it, the guest's thread (their first message showing). */
async function openThreadOf(operator: Operator, guest: Guest) {
	const { page } = operator;
	await openInbox(page);
	await showView(page, "All");
	await search(page, guest.id);
	await expect(rowOf(page, guest), `${operator.label} has ${guest.id}'s thread`).toBeVisible();
	await rowOf(page, guest).click();
	await expect(openThread(page).getByText(guest.texts[0], { exact: true })).toBeVisible();
}

/** The open thread's header control that holds the thread's actions (the manager's ⋯). */
function threadActions(page: Page) {
	return openThread(page).getByRole("button", { name: deletionCopy.actions, exact: true });
}

/** "Delete guest data" in the thread actions menu (its reason, when disabled, may follow). */
function deleteItem(page: Page) {
	return page.getByRole("menuitem", { name: new RegExp(`^${escapeRegExp(deletionCopy.delete)}`) });
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The manager opens the thread's actions; the menu offers "Delete guest data". */
async function openThreadActionsMenu(page: Page) {
	await expect(threadActions(page), "the thread header has Thread actions").toBeVisible();
	await threadActions(page).click();
	await expect(deleteItem(page), "the menu offers Delete guest data").toBeVisible();
}

/** From the open thread's header: Thread actions, Delete guest data; the dialog, named for the guest. */
async function openDeletionDialog(page: Page, guest: Guest): Promise<Locator> {
	await openThreadActionsMenu(page);
	await expect(deleteItem(page), "Delete guest data can be chosen").toBeEnabled();
	await deleteItem(page).click();
	const dialog = page.getByRole("alertdialog", { name: deletionCopy.title(guest.id) });
	await expect(dialog, `the dialog asks "${deletionCopy.title(guest.id)}"`).toBeVisible();
	return dialog;
}

function confirmButton(dialog: Locator) {
	return dialog.getByRole("button", { name: deletionCopy.confirm, exact: true });
}

/** The dialog's Reason select (a combobox). */
function reasonSelect(dialog: Locator) {
	return dialog.getByRole("combobox", { name: deletionCopy.reasonLabel });
}

/** A reason in the open Reason select's list (the list sits outside the dialog). */
function reasonOption(page: Page, reason: Reason) {
	return page.getByRole("option", { name: deletionCopy.reasons[reason], exact: true });
}

/** The manager opens the Reason select and picks a reason; the select shows it. */
async function chooseReason(page: Page, dialog: Locator, reason: Reason) {
	await reasonSelect(dialog).click();
	await reasonOption(page, reason).click();
	await expect(reasonOption(page, reason), "the reasons list closes").toHaveCount(0);
	await expect(reasonSelect(dialog), "the select shows the chosen reason").toContainText(
		deletionCopy.reasons[reason],
	);
}

/** The note box: "Note (optional)", or "Note" when the reason is Other. */
function noteBox(dialog: Locator, reason?: Reason) {
	return dialog.getByRole("textbox", {
		name: reason === "other" ? deletionCopy.noteLabel : deletionCopy.noteOptional,
		exact: true,
	});
}

/** The manager gives a reason, and a note when one is given, in the open dialog. */
async function giveReason(page: Page, dialog: Locator, reason: Reason, note?: string) {
	await chooseReason(page, dialog, reason);
	if (note !== undefined) {
		await noteBox(dialog, reason).fill(note);
	}
	await expect(
		confirmButton(dialog),
		"with a reason given, the confirm can be pressed",
	).toBeEnabled();
}

/** The manager confirms in the dialog: the deletion is taken and the toast says so. */
async function confirmDeletion(page: Page, dialog: Locator) {
	const confirm = confirmButton(dialog);
	await expect(confirm, "the dialog has its Delete guest data button").toBeVisible();
	const answered = page.waitForResponse(
		(r) => r.request().method() === "POST" && r.url().endsWith("/deletion"),
	);
	await confirm.click();
	expect((await answered).status(), "the deletion is taken").toBe(200);
	await expect(
		page.getByText(deletionCopy.done, { exact: true }),
		`the toast says "${deletionCopy.done}"`,
	).toBeVisible();
}

/**
 * The manager deletes the guest's data from their thread, through the dialog, giving a reason
 * (the guest asked, unless said otherwise) and, when given, a note.
 */
async function deleteAsManager(
	manager: Operator,
	guest: Guest,
	{ reason = "guest_request", note }: { reason?: Reason; note?: string } = {},
) {
	await openThreadOf(manager, guest);
	const dialog = await openDeletionDialog(manager.page, guest);
	await giveReason(manager.page, dialog, reason, note);
	await confirmDeletion(manager.page, dialog);
}

/**
 * What in this element paints red: text, fill, border, or an icon's fill or stroke. Colours are
 * resolved as the browser paints them (through a canvas, so any CSS colour form reads as sRGB).
 */
async function redPartsOf(root: Locator): Promise<string[]> {
	return root.evaluate((element) => {
		const context = document.createElement("canvas").getContext("2d", {
			willReadFrequently: true,
		});
		if (!context) throw new Error("no 2D canvas to read colours with");
		const isRed = (css: string) => {
			if (!css || css === "none") return false;
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = "rgba(0, 0, 0, 0)";
			context.fillStyle = css;
			context.fillRect(0, 0, 1, 1);
			const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
			return a > 64 && r >= 140 && r > 1.6 * g && r > 1.6 * b;
		};
		const parts: string[] = [];
		for (const el of [element, ...element.querySelectorAll("*")]) {
			const style = getComputedStyle(el);
			if (style.display === "none" || style.visibility === "hidden") continue;
			const ownText = [...el.childNodes].some(
				(n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
			);
			const bordered = style.borderTopStyle !== "none" && style.borderTopWidth !== "0px";
			const painted: [string, string][] = [
				["fill", style.backgroundColor],
				["text", ownText ? style.color : ""],
				["border", bordered ? style.borderTopColor : ""],
				["icon fill", el instanceof SVGElement ? style.fill : ""],
				["icon stroke", el instanceof SVGElement ? style.stroke : ""],
			];
			for (const [what, css] of painted) {
				if (isRed(css)) {
					const text = (el.textContent ?? "").trim().slice(0, 40);
					parts.push(`${what} of <${el.tagName.toLowerCase()}> "${text}"`);
				}
			}
		}
		return parts;
	});
}

/**
 * The person's Inbox no longer has the guest, under every view (and, for a manager, every owner
 * filter); searching the guest counts nothing. The other guest is still there, so the absences are
 * judged on a loaded Inbox.
 */
async function expectGoneFromInbox(operator: Operator, gone: Guest, stays: Guest) {
	const { page } = operator;
	await openInbox(page);
	const views = await viewsOf(page);
	// A manager's Inbox opens on Unassigned, which the owner filter sits out: look under All.
	await showView(page, "All");
	const filter = page.getByTestId("owner-filter");
	// Only a manager filters by owner; an agent has the one list.
	const owners = (await filter.count()) > 0 ? await filter.locator("option").count() : 1;
	for (let owner = 0; owner < owners; owner++) {
		if (owners > 1) {
			await filter.selectOption({ index: owner });
		}
		// Ends on All, where the filter shows again for the next owner.
		for (const name of views) {
			await showView(page, name);
			await expect(
				rowOf(page, gone),
				`${operator.label}: ${gone.id} is not under ${name} (owner filter ${owner})`,
			).toHaveCount(0);
		}
	}
	if (owners > 1) {
		await filter.selectOption({ index: 0 });
	}
	await showView(page, "All");
	await expect(rowOf(page, stays), `${operator.label} still has the other guest`).toBeVisible();
	await expect(rowOf(page, gone), `${operator.label}: ${gone.id} is not listed`).toHaveCount(0);

	await search(page, gone.id);
	for (const name of views) {
		await expect(
			view(page, name, 0),
			`${operator.label}: searching ${gone.id}, ${name} counts nothing`,
		).toBeVisible();
	}
	await expect(rowOf(page, gone)).toHaveCount(0);
}

/* ---------------------------------------------------------------- Home */

/** What Home says, section by section: the numbers a manager compares week to week. */
type HomeNumbers = {
	/** The funnel, by stage: Leads in, Engaged, In conversation. */
	funnel: Record<string, number>;
	/** The funnel as read aloud (its percentages included). */
	funnelSaid: string;
	/** The leads-by-day summary ("3 leads · 0.1 a day"). */
	perDay: string;
	/** Each day of leads by day, oldest first, as its tooltip says it ("Mon, Sep 7: 0"). */
	days: string[];
	/** Response time: the median, the 90th percentile, how many were answered and every band. */
	responseTime: string;
};

/** A day's tooltip on the leads-by-day chart: "Mon, Sep 7" then "Leads in 0". */
const DAY_TOOLTIP = new RegExp(
	`([A-Z][a-z]{2}, [A-Z][a-z]{2} \\d{1,2})\\s+${escapeRegExp(homeCopy.funnel.leadsIn)}\\s+(\\d+)`,
);

/** The person opens Home afresh and reads its numbers. */
async function readHome(page: Page): Promise<HomeNumbers> {
	await page.goto("/en/home");
	const main = page.getByRole("main");
	await expect(main.getByRole("heading", { name: homeCopy.waitingNow })).toBeVisible();

	const funnelList = main.getByRole("list", { name: homeCopy.funnel.title });
	await expect(funnelList).toBeVisible();
	const funnelSaid = await funnelList.ariaSnapshot();
	const funnel: Record<string, number> = {};
	for (const match of funnelSaid.matchAll(/paragraph: \d+ (.+)\n\s*- paragraph: "(\d+)"/g)) {
		funnel[match[1]] = Number(match[2]);
	}

	const perDay = (await main.getByText(/^\d+ leads? · [\d.]+ a day$/).textContent()) ?? "";

	const said = await main.ariaSnapshot();
	const responseAt = said.indexOf(`heading "${homeCopy.responseTime}"`);
	expect(responseAt, "Home shows Response time").toBeGreaterThanOrEqual(0);
	const responseTime = said.slice(responseAt);

	return { funnel, funnelSaid, perDay, days: await leadsByDay(page), responseTime };
}

/**
 * Each day of the leads-by-day chart, as the person reads it from the keyboard: focus the chart,
 * step to its first day and then day by day to the last, reading each day's tooltip. Checked to be
 * one reading per day of the window, each a different day, adding up to Leads in.
 */
async function leadsByDay(page: Page): Promise<string[]> {
	const main = page.getByRole("main");
	const windowMatch = new RegExp(
		escapeRegExp(homeCopy.window).replace(escapeRegExp("{days}"), "(\\d+)"),
	).exec(await main.innerText());
	expect(windowMatch, "Home names its window (Last N days)").not.toBeNull();
	const windowDays = Number(windowMatch![1]);

	const tooltip = async () => {
		const match = DAY_TOOLTIP.exec(await main.innerText());
		return match ? `${match[1]}: ${match[2]}` : null;
	};
	const chart = main.getByRole("application");
	await chart.focus();
	// The chart starts on its first day; one step right shows a tooltip, one step left is day 1.
	await page.keyboard.press("ArrowRight");
	await expect.poll(tooltip, { message: "the chart shows a day's tooltip" }).not.toBeNull();
	const second = await tooltip();
	await page.keyboard.press("ArrowLeft");
	await expect.poll(tooltip, { message: "the chart steps back to its first day" }).not.toBe(second);
	const days = [(await tooltip())!];
	while (days.length < windowDays) {
		await page.keyboard.press("ArrowRight");
		const previous = days[days.length - 1];
		await expect
			.poll(tooltip, { message: `the chart steps on from ${previous}` })
			.not.toBe(previous);
		days.push((await tooltip())!);
	}

	expect(new Set(days.map((d) => d.split(":")[0])).size, "one reading per day").toBe(windowDays);
	const total = days.reduce((sum, d) => sum + Number(d.split(": ")[1]), 0);
	const leadsIn = Number(
		/paragraph: \d+ .+\n\s*- paragraph: "(\d+)"/.exec(
			await main.getByRole("list", { name: homeCopy.funnel.title }).ariaSnapshot(),
		)?.[1],
	);
	expect(total, "the days add up to Leads in").toBe(leadsIn);
	return days;
}

/** Home's Leads in, read afresh from its funnel. */
async function leadsIn(page: Page): Promise<number> {
	await page.goto("/en/home");
	const funnelList = page.getByRole("main").getByRole("list", { name: homeCopy.funnel.title });
	await expect(funnelList).toBeVisible();
	const said = await funnelList.ariaSnapshot();
	const match = /paragraph: \d+ (.+)\n\s*- paragraph: "(\d+)"/.exec(said);
	expect(match?.[1], "the funnel starts with Leads in").toBe(homeCopy.funnel.leadsIn);
	return Number(match![2]);
}

/** Home's Waiting now entry for the guest (a link to their thread). */
function waitingNowEntry(page: Page, guest: Guest) {
	return page.getByRole("main").getByRole("link").filter({ hasText: guest.id });
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 180_000 });

// scenario: docs/e2e-scenarios.md Guest deletion 1
test.describe("Guest deletion 1 — a manager deletes a guest's data", () => {
	test("the manager's Thread actions → Delete guest data opens a dialog naming the guest, what goes (5 messages) and what is kept, with no CRM box and only its confirm red; the confirm waits for a reason, and for Other a note, under the note's hint; confirming deletes the thread for the manager and the agent, the nav count drops, and the API answers 404", async ({
		newOffice,
	}) => {
		const office = await newOffice("Deletion 1");
		const { agent, manager } = office;

		// A guest writes and is greeted (ADR 0021), and the manager gives them to the agent, who
		// replies to the first message; the guest writes twice more: three messages from the guest,
		// the greeting and one reply. Another guest, also the agent's, waits on a reply.
		const guest = await office.newGuest();
		await office.assignToAgent(guest);
		await answer(agent, guest);
		await guest.write();
		await guest.write();
		const bystander = await office.newGuest();
		await office.assignToAgent(bystander);
		const { id: threadId } = await threadSeenBy(manager, guest);
		await threadSeenBy(manager, bystander);

		// The agent's Inbox: both guests are their turn.
		await openInbox(agent.page);
		await expect(view(agent.page, "Your turn", 2), "two guests wait on the agent").toBeVisible(
			WITHIN_A_POLL,
		);
		await expect(navCount(agent.page), "the nav counts them").toHaveText("2");

		// The manager opens the guest's thread: Thread actions offers Delete guest data, not in red.
		await openThreadOf(manager, guest);
		await openThreadActionsMenu(manager.page);
		expect(
			await redPartsOf(deleteItem(manager.page)),
			"the menu item that opens the dialog is not red",
		).toEqual([]);
		await deleteItem(manager.page).click();

		// The dialog names the guest, says what goes and what is kept elsewhere, and that it is final.
		const dialog = manager.page.getByRole("alertdialog", {
			name: deletionCopy.title(guest.id),
		});
		await expect(dialog, `the dialog asks "${deletionCopy.title(guest.id)}"`).toBeVisible();
		await expect(
			dialog.getByText(deletionCopy.what(5), { exact: true }),
			"it says the thread's 5 messages go, with their translations, suggested reply and details",
		).toBeVisible();
		await expect(
			dialog.getByText(deletionCopy.keptZalo, { exact: true }),
			"it says the chat in the office's Zalo OA is kept",
		).toBeVisible();
		await expect(
			dialog.getByText(deletionCopy.irreversible, { exact: true }),
			"it says this can't be undone",
		).toBeVisible();
		await expect(dialog.getByRole("checkbox"), "an office with no CRM: no CRM box").toHaveCount(0);

		// A reason is required: until one is chosen, the confirm can't be pressed. The note is
		// optional, and its hint says what to leave out.
		const confirm = confirmButton(dialog);
		await expect(confirm, "the dialog has a Delete guest data button").toBeVisible();
		await expect(confirm, "no reason chosen: Delete guest data is disabled").toBeDisabled();
		await expect(reasonSelect(dialog), "the dialog asks for a reason").toBeVisible();
		await expect(noteBox(dialog), 'the note box is "Note (optional)"').toBeVisible();
		await expect(
			dialog.getByText(deletionCopy.noteHint, { exact: true }),
			`the note's hint says "${deletionCopy.noteHint}"`,
		).toBeVisible();

		// The reasons offered.
		await reasonSelect(dialog).click();
		for (const reason of REASONS) {
			await expect(
				reasonOption(manager.page, reason),
				`the reasons include "${deletionCopy.reasons[reason]}"`,
			).toBeVisible();
		}

		// Other needs a note: the box becomes "Note", and the confirm stays disabled while it is
		// empty (or only spaces), saying so.
		await reasonOption(manager.page, "other").click();
		await expect(reasonSelect(dialog)).toContainText(deletionCopy.reasons.other);
		await expect(noteBox(dialog, "other"), 'with Other, the note box is "Note"').toBeVisible();
		await expect(noteBox(dialog), 'and no longer "Note (optional)"').toHaveCount(0);
		const noteRequired = dialog.getByText(deletionCopy.noteRequired, { exact: true });
		await expect(confirm, "Other with no note: still disabled").toBeDisabled();
		await expect(noteRequired, `it says "${deletionCopy.noteRequired}"`).toBeVisible();
		await noteBox(dialog, "other").fill("   ");
		await expect(confirm, "Other with only spaces for a note: still disabled").toBeDisabled();
		const note = "Asked at the office to be forgotten";
		await noteBox(dialog, "other").fill(note);
		await expect(confirm, "Other with a note: Delete guest data can be pressed").toBeEnabled();
		await expect(noteRequired, "the note is no longer asked for").toHaveCount(0);

		// Its only red is the Delete guest data button.
		const confirmRed = await redPartsOf(confirm);
		expect(confirmRed, "the Delete guest data button is red").not.toEqual([]);
		expect(await redPartsOf(dialog), "nothing else in the dialog is red").toEqual(confirmRed);

		await confirmDeletion(manager.page, dialog);

		// The receipt keeps the reason and the note (it holds no contact details, so as written).
		const { receipts } = await guestDeletionRecords(office.id);
		expect(receipts, "one deletion on record").toHaveLength(1);
		expect(receipts[0], "the receipt says why: Other, with the note").toMatchObject({
			reason: "other",
			note,
		});

		// The agent's open Inbox drops the thread within its poll, and so does the nav count.
		await expect(view(agent.page, "Your turn", 1), "one guest waits on the agent now").toBeVisible(
			WITHIN_A_POLL,
		);
		await expect(navCount(agent.page), "the nav count drops").toHaveText("1", WITHIN_A_POLL);
		await expect(rowOf(agent.page, bystander), "the other guest still waits").toBeVisible();
		await expect(rowOf(agent.page, guest), "the deleted guest is gone").toHaveCount(0);

		// Gone from the manager's Inbox under every view and owner filter, and from search; the
		// agent's too, reloaded.
		await expectGoneFromInbox(manager, guest, bystander);
		await expectGoneFromInbox(agent, guest, bystander);

		// And through the API, for both.
		await expectGoneThroughApi(manager, guest, threadId);
		await expectGoneThroughApi(agent, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 2
test.describe("Guest deletion 2 — Home's numbers don't move when a guest is deleted", () => {
	test("three guests, two answered, one wrote back: deleting the one who wrote back leaves the funnel, response time and every day of leads by day unchanged for the agent and the manager, and Waiting now no longer lists them", async ({
		newOffice,
	}) => {
		const office = await newOffice("Deletion 2");
		const { agent, manager } = office;

		const wroteBack = await office.newGuest();
		const answered = await office.newGuest();
		const waiting = await office.newGuest();
		// The manager gives all three to the agent, so the agent's Waiting now can list them.
		for (const guest of [wroteBack, answered, waiting]) {
			await office.assignToAgent(guest);
		}
		await answer(agent, wroteBack);
		await answer(agent, answered);
		await wroteBack.write(`Is it still available? ${randomUUID().slice(0, 8)}`);
		await threadSeenBy(manager, wroteBack);

		// Before: Home counts all three leads, both answers and the guest who wrote back.
		const before = { agent: await readHome(agent.page), manager: await readHome(manager.page) };
		for (const [who, home] of Object.entries(before)) {
			expect(
				home.funnel,
				`${who}'s funnel counts three leads, two engaged, one in conversation`,
			).toMatchObject({
				[homeCopy.funnel.leadsIn]: 3,
				[homeCopy.funnel.engaged]: 2,
				[homeCopy.funnel.inConversation]: 1,
			});
			expect(home.responseTime, `${who}'s response time counts two answered leads`).toContain(
				"2 leads answered",
			);
			expect(home.responseTime, `${who}'s fastest band holds both`).toContain(
				`${homeCopy.spread.under5m} 2100%`,
			);
		}
		for (const operator of [agent, manager]) {
			await expect(
				waitingNowEntry(operator.page, wroteBack),
				`${operator.label}'s Waiting now lists the guest who wrote back`,
			).toHaveCount(1);
		}

		await deleteAsManager(manager, wroteBack);

		// After: Home, reloaded, says the same for both; Waiting now drops the deleted guest only.
		for (const operator of [agent, manager]) {
			const key = operator === agent ? "agent" : "manager";
			const after = await readHome(operator.page);
			expect(after.funnel, `${operator.label}'s funnel is unchanged`).toEqual(before[key].funnel);
			expect(after.funnelSaid, `${operator.label}'s funnel reads the same`).toBe(
				before[key].funnelSaid,
			);
			expect(after.responseTime, `${operator.label}'s response time is unchanged`).toBe(
				before[key].responseTime,
			);
			expect(after.perDay, `${operator.label}'s leads by day total is unchanged`).toBe(
				before[key].perDay,
			);
			expect(after.days, `${operator.label}'s every day of leads by day is unchanged`).toEqual(
				before[key].days,
			);
			await expect(
				waitingNowEntry(operator.page, waiting),
				`${operator.label}'s Waiting now still lists the guest no one answered`,
			).toHaveCount(1);
			await expect(
				waitingNowEntry(operator.page, wroteBack),
				`${operator.label}'s Waiting now no longer lists the deleted guest`,
			).toHaveCount(0);
		}
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 3
test.describe("Guest deletion 3 — an agent can't delete", () => {
	test("the deletion API refuses the agent (403) on their own thread, deleteInCrm true or false, before reading the body; their header offers no Delete guest data, the manager's does; nothing changes", async ({
		newOffice,
	}) => {
		const office = await newOffice("Deletion 3");
		const { agent, manager } = office;
		const theirs = await office.newGuest();
		await office.assignToAgent(theirs);
		const reply = await answer(agent, theirs);
		const { id: theirsId } = await threadSeenBy(agent, theirs);

		// Through the API: refused, whatever the body (a full one, with its reason, too), and
		// before it is read (no reason, or no body at all, is still a 403).
		for (const body of [
			{ deleteInCrm: false, reason: "guest_request" },
			{ deleteInCrm: true },
			{ deleteInCrm: false },
			undefined,
		]) {
			const res = await agent.api.post(deletionAddress(theirsId), body);
			const said = body === undefined ? "no body" : JSON.stringify(body);
			expect(res.status(), `the agent deleting their own thread (${said}) is refused`).toBe(403);
			expect(await res.json(), `the refusal says forbidden (${said})`).toEqual({
				error: "forbidden",
			});
		}

		// The manager's header on the agent's thread has the control: the positive control.
		await openThreadOf(manager, theirs);
		await openThreadActionsMenu(manager.page);
		await manager.page.keyboard.press("Escape");

		// The agent's header offers nothing of the kind.
		await openThreadOf(agent, theirs);
		await expect(
			threadActions(agent.page),
			`the agent's header on ${theirs.id} has no Thread actions`,
		).toHaveCount(0);
		await expect(
			agent.page.getByRole("menuitem", { name: deletionCopy.delete }),
			"no Delete guest data",
		).toHaveCount(0);
		await expect(
			agent.page.getByRole("button", { name: deletionCopy.delete }),
			"no Delete guest data",
		).toHaveCount(0);

		// Nothing changed, for the agent and the manager: the thread opens, with the guest's
		// message and the agent's reply.
		for (const operator of [agent, manager]) {
			const opened = await operator.api.get(threadAddress(theirsId));
			expect(opened.status(), `${operator.label} still opens ${theirs.id}`).toBe(200);
			await openThreadOf(operator, theirs);
			await expect(
				openThread(operator.page).getByText(reply, { exact: true }),
				`${operator.label} still sees the agent's reply`,
			).toBeVisible();
		}
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 4
test.describe("Guest deletion 4 — the platform admin can't delete", () => {
	test("the platform admin, owner of the office, gets 403 and the thread is unchanged; signed out, 401; a manager of another office, 404, even with no reason; the office's own manager's same request deletes it", async ({
		admin,
		newOffice,
		request,
	}) => {
		const office = await newOffice("Deletion 4");
		const { manager } = office;
		const guest = await office.newGuest();
		const { id: threadId } = await threadSeenBy(manager, guest);
		const body = { deleteInCrm: false, reason: "guest_request" };
		expect(
			await admin.memberEmails(office.id),
			"the platform admin made the office, so the kit holds them as its owner",
		).toContain(PLATFORM_ADMIN.email);

		const byAdmin = await admin.api.post(deletionAddress(threadId), body);
		expect(byAdmin.status(), "the platform admin is refused").toBe(403);

		const signedOut = await withOrigin(request).post(deletionAddress(threadId), body);
		expect(signedOut.status(), "nobody signed in is refused").toBe(401);

		const otherManager = await apiAs(MANAGER);
		try {
			const byOther = await otherManager.post(deletionAddress(threadId), body);
			expect(byOther.status(), "a manager of another office finds no such thread").toBe(404);
			const byOtherNoReason = await otherManager.post(deletionAddress(threadId), {
				deleteInCrm: false,
			});
			expect(
				byOtherNoReason.status(),
				"with no reason either: still no such thread (404 before the body's 400)",
			).toBe(404);
		} finally {
			await otherManager.dispose();
		}

		// The thread is unchanged.
		const opened = await manager.api.get(threadAddress(threadId));
		expect(opened.status(), "the office's manager still opens the thread").toBe(200);
		await openThreadOf(manager, guest);

		// The refusals were about who asked: the office's own manager's same request deletes it.
		const byManager = await manager.api.post(deletionAddress(threadId), body);
		expect(byManager.status(), "the office's manager deletes the thread").toBe(200);
		await expectGoneThroughApi(manager, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 7
test.describe("Guest deletion 7 — no CRM, no checkbox", () => {
	test("with no CRM the dialog has no CRM box; the API given deleteInCrm true deletes the thread, answers crm null and touches no CRM", async ({
		newOffice,
	}) => {
		const office = await newOffice("Deletion 7");
		const { manager } = office;
		const guest = await office.newGuest();
		const { id: threadId } = await threadSeenBy(manager, guest);

		// The dialog: no CRM box. Cancelling deletes nothing.
		await openThreadOf(manager, guest);
		const dialog = await openDeletionDialog(manager.page, guest);
		await expect(confirmButton(dialog), "the dialog is the deletion's").toBeVisible();
		await expect(dialog.getByRole("checkbox"), "no CRM box").toHaveCount(0);
		await expect(dialog.getByText(/\bCRM\b/), "nothing about a CRM").toHaveCount(0);
		await dialog.getByRole("button", { name: deletionCopy.cancel, exact: true }).click();
		await expect(dialog).toHaveCount(0);
		expect((await manager.api.get(threadAddress(threadId))).status(), "nothing deleted").toBe(200);

		// The API, asked to delete in the CRM too: the thread goes, and no CRM is touched.
		const res = await manager.api.post(deletionAddress(threadId), {
			deleteInCrm: true,
			reason: "test_data",
		});
		expect(res.status(), "the deletion is taken").toBe(200);
		expect(await res.json(), "no CRM lead, so no CRM result").toEqual({ crm: null });
		await expectGoneThroughApi(manager, guest, threadId);
		expect(await mockCrmLeads(office.id), "no lead anywhere for the office").toEqual([]);
		const { receipts } = await guestDeletionRecords(office.id);
		expect(receipts, "one deletion on record").toHaveLength(1);
		expect(
			receipts[0],
			"the record names no CRM and no CRM result, and keeps the reason, with no note",
		).toMatchObject({
			crmKind: null,
			crmResult: null,
			reason: "test_data",
			note: null,
		});
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 8
test.describe("Guest deletion 8 — not while a reply is sending", () => {
	test("while the agent's approved reply is sending, Delete guest data is disabled with its reason and the API answers 409 reply_sending, and the thread is unchanged; once the reply is sent, deleting works", async ({
		newOffice,
	}) => {
		const office = await newOffice("Deletion 8");
		const { agent, manager } = office;
		const guest = await office.newGuest();
		const bystander = await office.newGuest();
		// The reply held sending is the agent's, so the thread is theirs (ADR 0022).
		await office.assignToAgent(guest);
		const { id: threadId } = await threadSeenBy(manager, guest);
		await threadSeenBy(manager, bystander);
		const release = await holdReplySending(office.id, threadId, agent.id);

		// The manager's menu item is disabled, saying why.
		await openThreadOf(manager, guest);
		await openThreadActionsMenu(manager.page);
		await expect(deleteItem(manager.page), "Delete guest data is disabled").toBeDisabled();
		await expect(
			manager.page.getByText(deletionCopy.sendingReason, { exact: true }),
			`it says "${deletionCopy.sendingReason}"`,
		).toBeVisible();
		await manager.page.keyboard.press("Escape");

		// The API refuses too.
		const refused = await manager.api.post(deletionAddress(threadId), {
			deleteInCrm: false,
			reason: "guest_request",
		});
		expect(refused.status(), "deleting while a reply is sending is refused").toBe(409);
		expect(await refused.json()).toEqual({ error: "reply_sending" });

		// The thread is unchanged.
		expect(
			(await manager.api.get(threadAddress(threadId))).status(),
			"the thread is still there",
		).toBe(200);
		await openThreadOf(manager, guest);

		// The vendor answers: the reply is sent. Now the manager deletes the guest's data.
		await release();
		await deleteAsManager(manager, guest);
		await expectGoneThroughApi(manager, guest, threadId);
		await expectGoneFromInbox(manager, guest, bystander);
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 9 (with no CRM; the mock CRM's new lead is #139's)
test.describe("Guest deletion 9 — a guest who writes again is a new guest", () => {
	test("after the manager deletes the agent's guest, the same Zalo user writing again has a fresh thread: Unassigned and Your turn for the manager, with only the new message of theirs, unseen by the agent, and Home counts one more lead", async ({
		newOffice,
	}) => {
		const office = await newOffice("Deletion 9");
		const { agent, manager } = office;

		// The guest was the agent's and answered, so a fresh thread is told from the old one.
		const guest = await office.newGuest();
		await office.assignToAgent(guest);
		const reply = await answer(agent, guest);
		const { id: oldId } = await threadSeenBy(manager, guest);
		const leadsBefore = await leadsIn(manager.page);
		expect(leadsBefore, "Home counts the guest as a lead").toBe(1);

		const res = await manager.api.post(deletionAddress(oldId), {
			deleteInCrm: false,
			reason: "guest_request",
		});
		expect(res.status(), "the manager deletes the guest's data").toBe(200);
		await expectGoneThroughApi(manager, guest, oldId);

		// The same Zalo user writes again, a new message.
		const [first] = guest.texts;
		const again = await guest.write(`Back again, ${randomUUID().slice(0, 8)}`);
		const { id: newId } = await threadSeenBy(manager, guest, { waiting: true });

		// The manager: Your turn, Unassigned, the new message only (an auto-reply may be there).
		const { page } = manager;
		await openInbox(page);
		await search(page, guest.id);
		const row = rowOf(page, guest);
		await showView(page, "All");
		await expect(row, "the manager lists the guest").toBeVisible();
		await expect(row.getByTestId("thread-status"), "the guest is Your turn").toHaveText(
			saas.inbox.yourTurn,
		);
		const flag = row.getByTestId("thread-owner");
		await expect(flag, "the fresh thread is Unassigned").toHaveAttribute(
			"data-owner",
			"unassigned",
		);
		await expect(flag).toHaveText(ownerCopy("en").unassigned);
		await row.click();
		const thread = openThread(page);
		await expect(
			thread.getByText(again, { exact: true }),
			"the new message is there",
		).toBeVisible();
		await expect(
			thread.getByText(first, { exact: true }),
			"the deleted message is not",
		).toHaveCount(0);
		await expect(thread.getByText(reply, { exact: true }), "nor the agent's old reply").toHaveCount(
			0,
		);

		// The agent: not listed, and the thread's address is a 404.
		const listed = await agent.api.get("/api/conversations");
		expect(listed.status()).toBe(200);
		expect(
			((await listed.json()) as ListedThread[]).map((t) => t.guestId),
			"the agent does not list the fresh thread",
		).not.toContain(guest.id);
		expect(
			(await agent.api.get(threadAddress(newId))).status(),
			"the agent opening the fresh thread finds nothing",
		).toBe(404);
		await openInbox(agent.page);
		await showView(agent.page, "All");
		await search(agent.page, guest.id);
		await expect(view(agent.page, "All", 0), "the agent's search finds nothing").toBeVisible();
		await expect(rowOf(agent.page, guest)).toHaveCount(0);

		// Home: one more lead.
		expect(await leadsIn(manager.page), "Home counts the returning guest as a new lead").toBe(
			leadsBefore + 1,
		);
	});
});

// scenario: docs/e2e-scenarios.md Guest deletion 10 (the deletions with no CRM; the CRM box's are #139's)
test.describe("Guest deletion 10 — the record names no guest", () => {
	test("the API refuses (400) a deletion with no reason, an unknown one, or Other with no note, deleting and recording nothing; two deletions in an office with no CRM leave one receipt each, with the manager, a time, the message and reply counts, the reason, the note masked ([phone], [email]) or null, and no CRM result; no receipt or lead tally holds the guest's name, Zalo id, thread id, text, or the note's phone or email", async ({
		newOffice,
	}) => {
		const started = Date.now();
		const office = await newOffice("Deletion 10");
		const { agent, manager } = office;

		// One guest wrote twice, was greeted and answered (4 messages, 1 reply); one wrote once and
		// was greeted (2, 0). The greeting is a message, not a reply (ADR 0021).
		const answered = await office.newGuest();
		await answered.write();
		await office.assignToAgent(answered);
		await answer(agent, answered);
		const unanswered = await office.newGuest();
		await greeted(manager, unanswered);
		const { id: answeredId } = await threadSeenBy(manager, answered);
		const { id: unansweredId } = await threadSeenBy(manager, unanswered);

		// The manager deletes the unanswered guest through the API: refused with no reason, an
		// unknown one, or Other with no note (empty, or only spaces); nothing is deleted and
		// nothing is recorded.
		for (const [what, body] of [
			["no reason", { deleteInCrm: false }],
			["an unknown reason", { deleteInCrm: false, reason: "no_longer_interested" }],
			["Other with no note", { deleteInCrm: false, reason: "other" }],
			["Other with an empty note", { deleteInCrm: false, reason: "other", note: "" }],
			["Other with a note of spaces", { deleteInCrm: false, reason: "other", note: "   " }],
		] as const) {
			const refused = await manager.api.post(deletionAddress(unansweredId), body);
			expect(refused.status(), `deleting with ${what} is refused`).toBe(400);
		}
		expect(
			(await manager.api.get(threadAddress(unansweredId))).status(),
			"the refused deletions left the thread",
		).toBe(200);
		expect(
			(await guestDeletionRecords(office.id)).receipts,
			"the refused deletions left no receipt",
		).toEqual([]);

		// With a reason and no note, it is taken.
		const res = await manager.api.post(deletionAddress(unansweredId), {
			deleteInCrm: false,
			reason: "duplicate_or_spam",
		});
		expect(res.status(), "the API deletion is taken").toBe(200);

		// Then the answered guest through the dialog, the guest having asked, with a note that
		// slips in a Vietnamese mobile number and an email (and no other digit).
		const phone = "0912 345 678";
		const email = "guest.mail@example.com";
		await deleteAsManager(manager, answered, {
			reason: "guest_request",
			note: `Asked by phone on ${phone} and by mail from ${email} to be forgotten`,
		});
		await expectGoneThroughApi(manager, unanswered, unansweredId);
		await expectGoneThroughApi(manager, answered, answeredId);

		const { receipts, tallies } = await guestDeletionRecords(office.id);
		expect(receipts, "one receipt per deletion").toHaveLength(2);
		const expected = [
			{ messages: 2, answers: 0, reason: "duplicate_or_spam", note: null },
			{ messages: 4, answers: 1, reason: "guest_request" },
		];
		receipts.forEach((receipt, i) => {
			expect(
				receipt,
				`receipt ${i + 1}: the manager, the counts, the reason, no CRM result`,
			).toMatchObject({
				officeId: office.id,
				actorId: manager.id,
				actorName: manager.name,
				...expected[i],
				crmKind: null,
				crmResult: null,
			});
			const at = Date.parse(receipt.at);
			expect(at, `receipt ${i + 1} is timed during the test`).toBeGreaterThanOrEqual(
				started - 5_000,
			);
			expect(at, `receipt ${i + 1} is timed during the test`).toBeLessThanOrEqual(
				Date.now() + 5_000,
			);
		});
		// ADR 0020: one lead tally per deleted guest who wrote in (judged so the next check has
		// something to look at).
		expect(tallies, "one lead tally per deleted guest").toHaveLength(2);

		// The note is kept with its contact details masked: neither the number (nor any part of
		// it) nor the email is stored.
		const note = receipts[1].note ?? "";
		expect(note, "the dialog's note is kept").toContain("to be forgotten");
		expect(note, "the phone number is masked").toContain("[phone]");
		expect(note, "the email is masked").toContain("[email]");
		expect(note, "no part of the phone number is kept").not.toMatch(/\d{3}/);
		expect(note, "no part of the email is kept").not.toMatch(/@|example\.com|guest\.mail/);

		const record = JSON.stringify({ receipts, tallies });
		const identifiers: [string, string][] = [
			["the first guest's name and Zalo id", answered.id],
			["the second guest's name and Zalo id", unanswered.id],
			["the first thread's id", answeredId],
			["the second thread's id", unansweredId],
			// ADR 0020: free text is never kept.
			...[...answered.texts, ...unanswered.texts].map((text): [string, string] => [
				"a message's text",
				text,
			]),
			["the phone number in the note", phone],
			["the phone number in the note, without spaces", phone.replaceAll(" ", "")],
			["the email in the note", email],
		];
		for (const [what, value] of identifiers) {
			expect(record, `no receipt or tally holds ${what}`).not.toContain(value);
		}
	});
});
