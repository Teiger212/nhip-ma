/**
 * An office of the test's own (never the walk office: what a test changes there, a language, a
 * switch, would reach every other spec), with its own Zalo OA, a manager and, when asked, an
 * agent; guests who write to it through signed Zalo webhooks; and the reads every such spec makes
 * of a guest's thread (#278). A spec's own `base.extend` builds its `office` fixture with
 * `withOwnOffice`; everything is released and deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";

import type { Admin } from "./fixtures";
import { setNameGuestsSee } from "./name-guests-see";
import { deleteOffice } from "./offices";
import type { Joined } from "./operators";
import { joinOffice } from "./operators";
import { connectZaloOa, releaseZaloOa } from "./pipes";
import type { Api } from "./session";
import type { ZaloDelivery } from "./zalo";
import { deliverZalo, signedZaloText } from "./zalo";

/* ---------------------------------------------------------------- the office and its people */

/** What an operator is called: their account name, and the name guests see (#266). Both optional. */
export type Person = { name?: string; nameGuestsSee?: string };

export type OwnOfficeOptions = {
	/** Marks the office's slug, its OA and guest ids, and its operators' emails. */
	tag: string;
	/** The office's name, as its auto-reply's label and the template sign it. */
	name: string;
	/** The manager's names, set once they joined. */
	manager?: Person;
	/**
	 * An agent who joins with the manager, up front (in parallel), with these names. Left out, an
	 * agent is invited and joins on the first `agent()`.
	 */
	agent?: Person;
};

/** A guest who has not written yet, on the office's Zalo OA; a nameless Zalo guest goes by their id. */
export type Guest = {
	id: string;
	/** The guest writes this text (a signed Zalo webhook the app takes). */
	write: (text: string) => Promise<void>;
	/** The guest's message, signed but not yet delivered (to deliver at one moment). */
	signed: (text: string) => ZaloDelivery;
};

export type OwnOffice = {
	id: string;
	/** Its settings are at `/{locale}/{slug}/settings/general`. */
	slug: string;
	name: string;
	/** A manager (the kit's `admin`) who accepted their invitation and reads every thread. */
	manager: Joined;
	/** The office's agent (the kit's `member`): the one who joined up front, or one invited now. */
	agent: () => Promise<Joined>;
	newGuest: () => Guest;
};

/** What the office needs from the test: the platform admin, a browser, and a request context. */
export type OwnOfficeSetup = { admin: Admin; browser: Browser; request: APIRequestContext };

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
export function uniqueId(tag: string, kind: string): string {
	return `e2e-${tag}-${kind}-${randomUUID()}`;
}

/**
 * Creates the office, connects its Zalo OA, joins its manager (and the agent, when given up front),
 * gives each the names asked for, hands the office to `use`, then closes every operator's browser,
 * releases the OA and deletes the office (ADR 0013 removes its members with it).
 */
export async function withOwnOffice(
	{ admin, browser, request }: OwnOfficeSetup,
	options: OwnOfficeOptions,
	use: (office: OwnOffice) => Promise<void>,
): Promise<void> {
	const { tag, name } = options;
	const slug = `e2e-${tag}-${randomUUID()}`;
	const created = await admin.api.post("/api/auth/organization/create", { name, slug });
	expect(created.status(), `the platform admin creates "${name}"`).toBe(200);
	const { id } = (await created.json()) as { id: string };
	const oaId = uniqueId(tag, "oa");
	const joined: Joined[] = [];
	try {
		await connectZaloOa(id, oaId);
		const join = async (role: "member" | "admin", person: Person = {}) => {
			const operator = await joinOffice(
				admin,
				browser,
				id,
				role,
				`${tag}-${role === "admin" ? "manager" : "agent"}`,
			);
			joined.push(operator);
			if (person.name) {
				const renamed = await operator.api.post("/api/auth/update-user", { name: person.name });
				expect(renamed.ok(), `${person.name} takes their name (${renamed.status()})`).toBe(true);
			}
			if (person.nameGuestsSee) {
				await setNameGuestsSee(operator.page.request, person.nameGuestsSee);
			}
			return operator;
		};
		const [manager, upFront] = await Promise.all([
			join("admin", options.manager),
			options.agent ? join("member", options.agent) : undefined,
		]);
		let agent: Promise<Joined> | undefined = upFront ? Promise.resolve(upFront) : undefined;
		await use({
			id,
			slug,
			name,
			manager,
			agent: () => (agent ??= join("member")),
			newGuest: () => guestOf(request, tag, oaId),
		});
	} finally {
		for (const operator of joined) {
			await operator.close();
		}
		await releaseZaloOa(oaId);
		await deleteOffice(admin.api, id);
	}
}

function guestOf(request: APIRequestContext, tag: string, oaId: string): Guest {
	const id = uniqueId(tag, "guest");
	const signed = (text: string) => signedZaloText({ guestId: id, oaId, text });
	return { id, signed, write: (text) => deliverZalo(request, signed(text)) };
}

/* ---------------------------------------------------------------- the thread, through the API */

/** A thread as the conversations API lists it. */
export type ListedThread = {
	id: string;
	guestId: string;
	owner: unknown;
	unansweredInboundId: string | null;
};

export type Message = { direction: "in" | "out"; text: string };

/** A thread as it opens through the API. */
export type Thread = { unansweredInboundId: string | null; messages: Message[] };

/** The guest's thread as `api`'s conversations list shows it, once it is there. */
export async function listedThreadOf(api: Api, guestId: string): Promise<ListedThread> {
	let thread: ListedThread | undefined;
	await expect(async () => {
		const res = await api.get("/api/conversations");
		expect(res.status(), "the office's threads are listed").toBe(200);
		thread = ((await res.json()) as ListedThread[]).find((t) => t.guestId === guestId);
		expect(thread, `the list holds ${guestId}`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return thread!;
}

/** The guest's thread id, once `api`'s conversations list shows it. */
export async function threadIdOf(api: Api, guestId: string): Promise<string> {
	return (await listedThreadOf(api, guestId)).id;
}

export async function readThread(api: Api, threadId: string): Promise<Thread> {
	const res = await api.get(`/api/conversations/${encodeURIComponent(threadId)}`);
	expect(res.status(), "the thread opens").toBe(200);
	return (await res.json()) as Thread;
}

/** The office's messages in the thread. */
export async function officeMessages(api: Api, threadId: string): Promise<Message[]> {
	return (await readThread(api, threadId)).messages.filter((m) => m.direction === "out");
}

/** The greeting goes out "within seconds"; a production build under load gets a margin. */
export const WITHIN_SECONDS = { timeout: 20_000 };

/**
 * The office greets the guest within seconds of their first message: once it has, the thread
 * holds exactly one office message, the greeting, whose text this is.
 */
export async function greetingIn(api: Api, threadId: string): Promise<string> {
	await expect
		.poll(async () => (await officeMessages(api, threadId)).length, {
			message: "the office greets the guest within seconds of their first message",
			...WITHIN_SECONDS,
		})
		.toBeGreaterThan(0);
	const office = await officeMessages(api, threadId);
	expect(office, "one office message: the greeting").toHaveLength(1);
	return office[0].text;
}

/** The thread holds this many of the guest's messages: the last one they wrote has arrived. */
export async function guestMessagesArrived(api: Api, threadId: string, count: number) {
	await expect
		.poll(
			async () =>
				(await readThread(api, threadId)).messages.filter((m) => m.direction === "in").length,
			{ message: `the thread holds the guest's ${count} messages` },
		)
		.toBe(count);
}

/* ---------------------------------------------------------------- the Inbox */

/** The thread's link: the Inbox, in this interface language, with the thread open. */
export function threadLink(threadId: string, locale: "en" | "vi" = "en"): string {
	return `/${locale}/inbox?thread=${encodeURIComponent(threadId)}`;
}

/**
 * The operator opens the thread by its link (in English unless told), once the open thread shows
 * this text of the guest's, exactly.
 */
export async function openByLink(
	page: Page,
	threadId: string,
	shownText: string,
	options: { locale?: "en" | "vi"; timeout?: number } = {},
) {
	await page.goto(threadLink(threadId, options.locale));
	await expect(
		page.getByRole("article").getByText(shownText, { exact: true }),
		`the open thread shows the guest's "${shownText}"`,
	).toBeVisible({ timeout: options.timeout });
}

/** The text, matched literally inside a RegExp. */
export function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
