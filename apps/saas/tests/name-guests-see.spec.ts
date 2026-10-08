import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import type { Locale } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import type { NameGuestsSee } from "./support/name-guests-see";
import { NAME_GUESTS_SEE_ROUTE, getNameGuestsSee } from "./support/name-guests-see";
import { deleteOffice } from "./support/offices";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { sendZaloText } from "./support/zalo";

/* ---------------------------------------------------------------- what the scenarios promise */

/** The office every thread here belongs to (docs/e2e-scenarios.md, Name guests see). */
const OFFICE_NAME = "Saigon Prime Test";

/**
 * The agent's account name, family name first, as Vietnamese names are written: the template must
 * never introduce her by one of its words ("Trần" would be the first).
 */
const AGENT_ACCOUNT_NAME = "Trần Thị Lan";

/** The name guests see the agent saves. */
const LAN = "Lan";

/**
 * The field's label on the account page, written out rather than read from saas.json: the wording
 * is the contract. The VI wording is pending a native read (#78).
 */
const FIELD_LABEL: Record<Locale, string> = {
	en: "Name guests see",
	vi: "Tên hiển thị với khách",
};

/** The account page's Save (VI "Lưu"); only the EN page is saved through here. */
const SAVE = "Save";

/**
 * The kit's own "Your name" box on the same page, which every signed-in account has: the page has
 * loaded once it shows, so an absence judged after it is not just a page still loading.
 */
const KIT_NAME_LABEL: Record<Locale, string> = { en: "Your name", vi: "Tên của bạn" };

/** The template's intro (Suggested reply template, "The EN copy"); a Zalo guest has no name. */
function introOf(nameGuestsSee: string): string {
	return `Hi, I'm ${nameGuestsSee} from ${OFFICE_NAME}.`;
}

/** The guest's first message, which the auto-reply greets. */
const FIRST_MESSAGE = "Hi, we're looking to rent an apartment in Tay Ho";

/** The greeting goes out "within seconds"; a production build under load gets a margin. */
const WITHIN_SECONDS = { timeout: 20_000 };

/**
 * The reply box's own name, which is how a person finds it, not what a scenario promises
 * (packages/i18n/translations/en/saas.json, `inbox.reply`).
 */
const REPLY_LABEL = (
	JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json"),
			"utf8",
		),
	) as { inbox: { reply: string } }
).inbox.reply;

/* ---------------------------------------------------------------- the office and its guests */

type Guest = { id: string; write: (text: string) => Promise<void> };

/**
 * An office of the test's own named "Saigon Prime Test" (deleted afterwards), with its own Zalo
 * OA (released afterwards), an invited manager (the kit's `admin`) and an invited agent whose
 * account name is "Trần Thị Lan" and who has set no name guests see. The auto-reply is on, by
 * default.
 */
type NamedOffice = { manager: Joined; agent: Joined; newGuest: () => Guest };

const test = base.extend<{ office: NamedOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const created = await admin.api.post("/api/auth/organization/create", {
			name: OFFICE_NAME,
			slug: `e2e-ngs-${randomUUID()}`,
		});
		expect(created.status(), `the platform admin creates "${OFFICE_NAME}"`).toBe(200);
		const { id } = (await created.json()) as { id: string };
		const oaId = uniqueId("oa");
		const joined: Joined[] = [];
		try {
			await connectZaloOa(id, oaId);
			const join = async (role: "member" | "admin") => {
				const operator = await joinOffice(admin, browser, id, role, `ngs-${role}`);
				joined.push(operator);
				return operator;
			};
			const [manager, agent] = await Promise.all([join("admin"), join("member")]);
			const renamed = await agent.api.post("/api/auth/update-user", { name: AGENT_ACCOUNT_NAME });
			expect(renamed.ok(), `the agent takes the name ${AGENT_ACCOUNT_NAME}`).toBe(true);
			await use({ manager, agent, newGuest: () => guestOf(request, oaId) });
		} finally {
			for (const operator of joined) {
				await operator.close();
			}
			await releaseZaloOa(oaId);
			await deleteOffice(admin.api, id);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-ngs-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	return { id, write: (text) => sendZaloText(request, { guestId: id, oaId, text }) };
}

/* ---------------------------------------------------------------- the thread, through the API */

type Thread = { messages: { direction: "in" | "out"; text: string }[] };

async function readThread(api: Api, threadId: string): Promise<Thread> {
	const res = await api.get(`/api/conversations/${encodeURIComponent(threadId)}`);
	expect(res.status(), "the thread opens").toBe(200);
	return (await res.json()) as Thread;
}

/**
 * A new guest writes their first message, the office greets them, and the manager assigns the
 * thread to the agent through the owner API: the thread's id.
 */
async function assignedGreetedThread(office: NamedOffice): Promise<string> {
	const { manager, agent } = office;
	const guest = office.newGuest();
	await guest.write(FIRST_MESSAGE);
	const assigner = assignerAs(manager.api);
	const threadId = await assigner.threadOf(guest.id);
	await expect
		.poll(
			async () =>
				(await readThread(manager.api, threadId)).messages.filter((m) => m.direction === "out")
					.length,
			{ message: "the office greets the guest within seconds", ...WITHIN_SECONDS },
		)
		.toBe(1);
	await assigner.assignTo(threadId, agent.userId);
	return threadId;
}

/* ---------------------------------------------------------------- the Inbox */

function openThread(page: Page) {
	return page.getByRole("article");
}

/** The operator opens the thread by its link, the guest's first message showing. */
async function openByLink(page: Page, threadId: string) {
	await page.goto(`/en/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(
		openThread(page).getByText(FIRST_MESSAGE, { exact: true }),
		"the thread shows the guest's message",
	).toBeVisible();
}

/** The open thread's reply box. */
function replyBox(page: Page) {
	return openThread(page).getByRole("textbox", { name: REPLY_LABEL, exact: true });
}

/** The text starts with exactly this sentence. */
function startingWith(sentence: string): RegExp {
	return new RegExp(`^${literal(sentence)}`);
}

function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------------------------------------------------------------- the account page */

/**
 * Opens the kit's account page (`/<locale>/settings/general`, never under the office's address),
 * once it has loaded: the kit's "Your name" box shows.
 */
async function openAccountPage(page: Page, locale: Locale = "en") {
	await page.goto(`/${locale}/settings/general`);
	await expect(page, `the account page, in ${locale}`).toHaveURL(
		new RegExp(`/${locale}/settings/general$`),
	);
	await expect(
		accountMain(page).getByRole("textbox", { name: KIT_NAME_LABEL[locale], exact: true }),
		"the account page has loaded",
	).toBeVisible();
}

function accountMain(page: Page): Locator {
	return page.getByRole("main");
}

/** The "Name guests see" box. */
function nameGuestsSeeField(page: Page, locale: Locale = "en"): Locator {
	return accountMain(page).getByRole("textbox", { name: FIELD_LABEL[locale], exact: true });
}

/** The page's Save for the field: the one in the form that holds it (each kit card is a form). */
function saveFor(page: Page, locale: Locale = "en"): Locator {
	return accountMain(page)
		.locator("form")
		.filter({ has: page.getByRole("textbox", { name: FIELD_LABEL[locale], exact: true }) })
		.getByRole("button", { name: SAVE, exact: true });
}

/** What the route answers the signed-in person, once it answers 200. */
async function readNameGuestsSee(api: APIRequestContext): Promise<NameGuestsSee> {
	const res = await getNameGuestsSee(api);
	expect(res.status(), `GET ${NAME_GUESTS_SEE_ROUTE}`).toBe(200);
	return (await res.json()) as NameGuestsSee;
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Name guests see 1
test.describe("Name guests see 1 — an agent sets it and is introduced by it", () => {
	test(`the agent finds "${FIELD_LABEL.en}" empty on their account page, saves "${LAN}": their assigned, greeted thread's reply box starts "${introOf(LAN)}", and after a reload the field still reads "${LAN}"`, async ({
		office,
	}) => {
		const { page } = office.agent;
		await openAccountPage(page);
		const field = nameGuestsSeeField(page);
		await expect(field, `"${FIELD_LABEL.en}" is on the account page, empty`).toHaveValue("");

		await field.fill(LAN);
		await saveFor(page).click();
		await expect
			.poll(async () => readNameGuestsSee(page.request), {
				message: `the page saved "${LAN}"`,
			})
			.toEqual({ nameGuestsSee: LAN });

		const threadId = await assignedGreetedThread(office);
		await openByLink(page, threadId);
		await expect(
			replyBox(page),
			"the box introduces the agent by their name guests see",
		).toHaveValue(startingWith(introOf(LAN)), WITHIN_SECONDS);

		await openAccountPage(page);
		await page.reload();
		await expect(nameGuestsSeeField(page), "the field still reads what was saved").toHaveValue(LAN);
	});
});
