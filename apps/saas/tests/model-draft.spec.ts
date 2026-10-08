import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { expect, test as base } from "./support/fixtures";
import { deleteOffice } from "./support/offices";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { sendZaloText } from "./support/zalo";

/* ---------------------------------------------------------------- what the scenarios promise */

/** The office every thread here belongs to (docs/e2e-scenarios.md, When the model drafts). */
const OFFICE_NAME = "Saigon Prime Test";

/**
 * The stub model's draft (`MODEL_STUB=draft,translate`, First greeting "How these run"), written
 * out rather than read from the app: the stub's text is the contract.
 */
const STUB_DRAFT = "Thanks for your message. I'll look into it and come back to you here.";

/** The template once the office has replied (Suggested reply template, "On a later turn"). */
const LATER_TEMPLATE = "Noted. I'll look into this and get back to you here shortly.";

/** The labels beside the reply box (ADR 0024, "The label"), the spaces around "·" aside. */
const AI_LABEL = /^\s*Suggested reply\s*·\s*AI\s*$/;
const TEMPLATE_LABEL = /^\s*Suggested reply\s*·\s*template\s*$/;
/** Any model label, whatever precedes it: what must not show before a human reply. */
const ANY_AI_LABEL = /·\s*AI\s*$/;

/** The quiet note next to Regenerate when a kept edit outlives the guest's new message (ADR 0024). */
const WROTE_AGAIN_NOTE = "Guest wrote again";

/** The stale-target refusal a kept edit must no longer meet (ADR 0011, amended by ADR 0024). */
const STALE_ERROR = /the guest wrote again/i;

/** The guest's first message, which the auto-reply greets. */
const FIRST_MESSAGE = "Hi, we're looking to rent an apartment in Tay Ho";
/** The guest's message after the agent's first reply: the model drafts for it. */
const PHOTOS = "Could you send me some photos?";
/** A later message about the pink book: the post-check blocks the stub's draft for it. */
const PINK_BOOK = "Is the pink book ready?";

/** The agent's own reply, typed over the model's draft (no digit, no paperwork word). */
const TYPED_REPLY = "Sure, I'm gathering photos of a few flats in Tay Ho for you now.";

/** The greeting goes out "within seconds"; a production build under load gets a margin. */
const WITHIN_SECONDS = { timeout: 20_000 };

/** A change the Inbox learns of by its poll: three production polls, for CI's margin. */
const WITHIN_POLLS = { timeout: 30_000 };

/** "A few polls later": the E2E build re-reads every second, so about five of them. */
const A_FEW_POLLS_MS = 5_000;

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
 * OA (released afterwards), an invited manager (the kit's `admin`) and an invited agent. The
 * auto-reply is on, by default.
 */
type DraftOffice = { manager: Joined; agent: Joined; newGuest: () => Guest };

const test = base.extend<{ office: DraftOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const created = await admin.api.post("/api/auth/organization/create", {
			name: OFFICE_NAME,
			slug: `e2e-draft-${randomUUID()}`,
		});
		expect(created.status(), `the platform admin creates "${OFFICE_NAME}"`).toBe(200);
		const { id } = (await created.json()) as { id: string };
		const oaId = uniqueId("oa");
		const joined: Joined[] = [];
		try {
			await connectZaloOa(id, oaId);
			const join = async (role: "member" | "admin") => {
				const operator = await joinOffice(admin, browser, id, role, `draft-${role}`);
				joined.push(operator);
				return operator;
			};
			const [manager, agent] = await Promise.all([join("admin"), join("member")]);
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
	return `e2e-draft-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	return { id, write: (text) => sendZaloText(request, { guestId: id, oaId, text }) };
}

/* ---------------------------------------------------------------- the thread, through the API */

type Thread = {
	unansweredInboundId: string | null;
	messages: { direction: "in" | "out"; text: string }[];
};

function threadAddress(threadId: string) {
	return `/api/conversations/${encodeURIComponent(threadId)}`;
}

async function readThread(api: Api, threadId: string): Promise<Thread> {
	const res = await api.get(threadAddress(threadId));
	expect(res.status(), "the thread opens").toBe(200);
	return (await res.json()) as Thread;
}

/** The thread holds this many of the guest's messages: the last one they wrote has arrived. */
async function guestMessagesArrived(api: Api, threadId: string, count: number) {
	await expect
		.poll(
			async () =>
				(await readThread(api, threadId)).messages.filter((m) => m.direction === "in").length,
			{ message: `the thread holds the guest's ${count} messages` },
		)
		.toBe(count);
}

/* ---------------------------------------------------------------- the Inbox */

function openThread(page: Page) {
	return page.getByRole("article");
}

/** The open thread's reply box. */
function replyBox(page: Page) {
	return openThread(page).getByRole("textbox", { name: REPLY_LABEL, exact: true });
}

function aiLabel(page: Page): Locator {
	return openThread(page).getByText(AI_LABEL);
}

function templateLabel(page: Page): Locator {
	return openThread(page).getByText(TEMPLATE_LABEL);
}

/** The note itself, exactly: never the stale-target error, which contains its words. */
function wroteAgainNote(page: Page): Locator {
	return openThread(page).getByText(WROTE_AGAIN_NOTE, { exact: true });
}

/** The operator opens the thread by its link, its latest guest message showing. */
async function openByLink(page: Page, threadId: string, latestText: string) {
	await page.goto(`/en/inbox?thread=${encodeURIComponent(threadId)}`);
	await expectGuestMessageShown(page, latestText);
}

async function expectGuestMessageShown(page: Page, text: string) {
	await expect(
		openThread(page).getByText(text, { exact: true }),
		`the open thread shows the guest's "${text}"`,
	).toBeVisible(WITHIN_POLLS);
}

/** The page's next read of the Inbox (the list or the open thread): one poll has passed. */
async function nextPoll(page: Page) {
	await page.waitForResponse(
		(res) =>
			res.request().method() === "GET" &&
			new URL(res.url()).pathname.startsWith("/api/conversations"),
	);
}

/** `check` holds after every poll for "a few polls" (about five seconds of them). */
async function holdsForAFewPolls(page: Page, check: () => Promise<void>) {
	const start = Date.now();
	await check();
	while (Date.now() - start < A_FEW_POLLS_MS) {
		await nextPoll(page);
		await check();
	}
}

/**
 * A guest's first message gets the auto-reply; the manager gives the thread to the agent, who
 * opens it by link and sends the suggestion as it stands with Approve and send: the office's first
 * human reply. Then the guest writes "Could you send me some photos?", and the agent opens the
 * thread again by link, where it stays open: the box holds the stub model's draft.
 */
async function draftedAfterFirstReply(
	office: DraftOffice,
): Promise<{ guest: Guest; threadId: string; page: Page; box: Locator }> {
	const { manager, agent } = office;
	const guest = office.newGuest();
	await guest.write(FIRST_MESSAGE);
	const threadId = await assignerAs(manager.api).threadOf(guest.id);
	await expect
		.poll(
			async () =>
				(await readThread(manager.api, threadId)).messages.filter((m) => m.direction === "out")
					.length,
			{ message: "the office greets the guest within seconds", ...WITHIN_SECONDS },
		)
		.toBe(1);
	await assignerAs(manager.api).assignTo(threadId, agent.userId);

	const { page } = agent;
	await openByLink(page, threadId, FIRST_MESSAGE);
	const box = replyBox(page);
	await expect(box, "the reply box holds a suggestion").not.toHaveValue("", WITHIN_SECONDS);
	await openThread(page).getByTestId("approve-and-send").click();
	await expect
		.poll(async () => (await readThread(agent.api, threadId)).unansweredInboundId, {
			message: "the agent's first reply is sent: the guest's message is answered",
		})
		.toBeNull();

	await guest.write(PHOTOS);
	await guestMessagesArrived(agent.api, threadId, 2);
	await openByLink(page, threadId, PHOTOS);
	await expect(box, "after the office's first human reply, the model drafts").toHaveValue(
		STUB_DRAFT,
		WITHIN_POLLS,
	);
	await expect(aiLabel(page), 'the draft is labelled "Suggested reply · AI"').toBeVisible();
	return { guest, threadId, page, box };
}

/**
 * Over the model's draft, the agent types their own reply; a few polls pass, so the edit has been
 * through the page's refresh; then the guest writes again and the new message shows in the open
 * thread, never reloaded (the typed text may live only in the page).
 */
async function typedThenGuestWroteAgain(office: DraftOffice) {
	const drafted = await draftedAfterFirstReply(office);
	const { guest, page, box } = drafted;
	await box.fill(TYPED_REPLY);
	await expect(box, "the box holds what the agent typed").toHaveValue(TYPED_REPLY);
	await nextPoll(page);
	await nextPoll(page);
	await expect(box, "the typed reply outlives the page's polls").toHaveValue(TYPED_REPLY);

	const again = "Also, do any of them have a balcony?";
	await guest.write(again);
	await expectGuestMessageShown(page, again);
	return { ...drafted, latest: again };
}

/**
 * The box holds exactly the agent's typed text and "Guest wrote again" shows, read together, so a
 * failure says what the box held instead.
 */
async function expectKeptEdit(page: Page, box: Locator) {
	await expect
		.poll(
			async () => ({
				box: await box.inputValue(),
				noteShown: await wroteAgainNote(page).isVisible(),
			}),
			{
				message: `the agent's text stays, with "${WROTE_AGAIN_NOTE}"`,
				...WITHIN_POLLS,
			},
		)
		.toEqual({ box: TYPED_REPLY, noteShown: true });
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md When the model drafts 1
test.describe("When the model drafts 1 — the model writes the reply after the office's first human reply", () => {
	test(`after the agent's first reply, the guest asks for photos: the agent's reply box holds the stub's draft, labelled "Suggested reply · AI"`, async ({
		office,
	}) => {
		await draftedAfterFirstReply(office);
	});
});

// scenario: docs/e2e-scenarios.md When the model drafts 2
test.describe("When the model drafts 2 — no model draft before the first human reply", () => {
	test(`a greeted guest's thread, opened by the agent, holds the template labelled "Suggested reply · template", and no AI draft replaces it over a few polls`, async ({
		office,
	}) => {
		const { manager, agent } = office;
		const guest = office.newGuest();
		await guest.write(FIRST_MESSAGE);
		const threadId = await assignerAs(manager.api).threadOf(guest.id);
		await expect
			.poll(
				async () =>
					(await readThread(manager.api, threadId)).messages.filter((m) => m.direction === "out")
						.length,
				{ message: "the office greets the guest within seconds", ...WITHIN_SECONDS },
			)
			.toBe(1);
		await assignerAs(manager.api).assignTo(threadId, agent.userId);

		const { page } = agent;
		await openByLink(page, threadId, FIRST_MESSAGE);
		const box = replyBox(page);
		await expect(box, "the reply box holds a suggestion").not.toHaveValue("", WITHIN_SECONDS);
		// Each look reads the box and both labels at once, so a failure says what the agent saw.
		const look = async () => ({
			aiLabelShown: (await openThread(page).getByText(ANY_AI_LABEL).count()) > 0,
			templateLabelShown: await templateLabel(page).isVisible(),
			isStubDraft: (await box.inputValue()) === STUB_DRAFT,
		});
		const template = { aiLabelShown: false, templateLabelShown: true, isStubDraft: false };
		await expect
			.poll(look, { message: 'the box holds the template, labelled "Suggested reply · template"' })
			.toEqual(template);
		const held = await box.inputValue();

		await holdsForAFewPolls(page, async () => {
			expect(await look(), "no model draft appears before any human reply").toEqual(template);
			expect(await box.inputValue(), "the box still holds the same template").toBe(held);
		});
	});
});

// scenario: docs/e2e-scenarios.md When the model drafts 3
test.describe("When the model drafts 3 — an edited reply survives the guest writing again", () => {
	test(`the agent types over the AI draft, the guest writes again: the box still holds exactly the typed text, with "${WROTE_AGAIN_NOTE}" next to Regenerate`, async ({
		office,
	}) => {
		const { page, box } = await typedThenGuestWroteAgain(office);

		await expectKeptEdit(page, box);
		await expect(
			openThread(page).getByRole("button", { name: "Regenerate" }),
			"Regenerate is beside it",
		).toBeVisible();
		await holdsForAFewPolls(page, async () => {
			expect(await box.inputValue(), "the agent's text is never overwritten").toBe(TYPED_REPLY);
		});
	});
});

// scenario: docs/e2e-scenarios.md When the model drafts 4
test.describe("When the model drafts 4 — sending the kept edit answers the latest message", () => {
	test(`the kept edit, sent with Approve and send, goes out with no "The guest wrote again" error, after the guest's latest message, and the thread leaves Your turn`, async ({
		office,
	}) => {
		const { agent } = office;
		const { page, box, threadId, latest } = await typedThenGuestWroteAgain(office);
		await expectKeptEdit(page, box);

		await openThread(page).getByTestId("approve-and-send").click();
		await expect
			.poll(
				async () => {
					const thread = await readThread(agent.api, threadId);
					const lastIn = thread.messages.findLastIndex(
						(m) => m.direction === "in" && m.text === latest,
					);
					const reply = thread.messages.findLastIndex(
						(m) => m.direction === "out" && m.text === TYPED_REPLY,
					);
					return {
						staleErrorShown: await page.getByText(STALE_ERROR).isVisible(),
						typedReplySent: reply !== -1,
						afterLatestGuestMessage: reply > lastIn,
						stillYourTurn: thread.unansweredInboundId !== null,
					};
				},
				{
					message: "the kept edit goes out as the answer to the guest's latest message",
					...WITHIN_POLLS,
				},
			)
			.toEqual({
				staleErrorShown: false,
				typedReplySent: true,
				afterLatestGuestMessage: true,
				stillYourTurn: false,
			});
		await expect(page.getByText(STALE_ERROR), 'no "The guest wrote again" error').toHaveCount(0);
	});
});

// scenario: docs/e2e-scenarios.md When the model drafts 5
test.describe("When the model drafts 5 — an untouched reply follows the guest", () => {
	test(`the agent leaves the AI draft untouched, the guest asks about the pink book: the box holds the later-turn template, labelled "Suggested reply · template", with no "${WROTE_AGAIN_NOTE}" note`, async ({
		office,
	}) => {
		const { guest, page, box } = await draftedAfterFirstReply(office);

		await guest.write(PINK_BOOK);
		await expectGuestMessageShown(page, PINK_BOOK);
		await expect(
			box,
			"the suggestion follows the guest: the template for that message",
		).toHaveValue(LATER_TEMPLATE, WITHIN_POLLS);
		await expect(templateLabel(page), 'labelled "Suggested reply · template"').toBeVisible();
		await expect(aiLabel(page), "no AI label").toHaveCount(0);
		await expect(wroteAgainNote(page), `no "${WROTE_AGAIN_NOTE}" note`).toHaveCount(0);
	});
});
