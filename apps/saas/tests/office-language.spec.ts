import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import type { Locale } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import { deleteOffice } from "./support/offices";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { appOrigin } from "./support/session";
import { deliverZalo, signedZaloText } from "./support/zalo";

/* ---------------------------------------------------------------- what the scenarios promise */

/**
 * The setting's own words (docs/e2e-scenarios.md, Office language; ADR 0025), written out rather
 * than read from saas.json: they are the contract. The VI copy is pending a native read (#78).
 */
const SETTING = {
	title: { en: "Office language", vi: "Ngôn ngữ văn phòng" },
	english: "English",
	vietnamese: "Tiếng Việt",
	saved: "Office language saved",
} as const;

/** The stub model's translation line (MODEL_STUB=translate, First greeting "How these run"). */
function stubLine(from: string, into: "English" | "Vietnamese"): string {
	return `Stub translation, ${from} to ${into}.`;
}

/** Any stub translation line into English, wherever it sits. */
const ANY_LINE_INTO_ENGLISH = /Stub translation, [^.]+ to English\./;

/** Any stub translation line at all. */
const ANY_STUB_LINE = /Stub translation\b/;

/** A Korean guest's first message (Guest language 2's). */
const KOREAN_TEXT = "안녕하세요, 서호에서 방 두 개짜리 아파트를 월세로 찾고 있어요.";

/** A Vietnamese guest's first message (First greeting 4's). */
const VIETNAMESE_TEXT = "Chào anh, tôi muốn thuê căn hộ ở Tây Hồ";

/** The app's not-found page (Team 8). */
const NOT_FOUND = "Page not found";

/**
 * The interface's own labels, which are how a person finds things and not what the scenario
 * promises (packages/i18n/translations/<locale>/saas.json): a translation's visually hidden label.
 */
function translationLabel(locale: Locale): string {
	const saas = JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, `../../../packages/i18n/translations/${locale}/saas.json`),
			"utf8",
		),
	) as { inbox: { translation: string } };
	return saas.inbox.translation;
}

/**
 * A translation is written in the background after the guest's message is taken, or when an older
 * thread is opened (Office language 5); the open thread learns of it within a poll. Three
 * production polls are the ceiling (AGENTS.md, writing-e2e-tests).
 */
const WITHIN_A_POLL = { timeout: 30_000 };

/* ---------------------------------------------------------------- the office and its people */

type Guest = { id: string; text: string; write: () => Promise<void> };

/**
 * An office of the test's own (never the walk office: a changed language would reach every other
 * spec), deleted afterwards, with a Zalo OA of its own (released afterwards), a manager (the kit's
 * `admin`) who accepted their invitation, and an agent (the kit's `member`) when the test asks.
 */
type LanguageOffice = {
	id: string;
	/** Its settings are at `/{locale}/{slug}/settings/general`. */
	slug: string;
	manager: Joined;
	/** An agent of the office, invited and joined on first ask. */
	agent: () => Promise<Joined>;
	/** A guest who has not written yet, who will write `text` on the office's OA. */
	newGuest: (text: string) => Guest;
};

const test = base.extend<{ office: LanguageOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const slug = `e2e-office-language-${randomUUID()}`;
		const created = await admin.api.post("/api/auth/organization/create", {
			name: "Office Language Test",
			slug,
		});
		expect(created.status(), "the platform admin creates the office").toBe(200);
		const { id } = (await created.json()) as { id: string };
		const oaId = uniqueId("oa");
		let manager: Joined | undefined;
		let agent: Joined | undefined;
		try {
			await connectZaloOa(id, oaId);
			manager = await joinOffice(admin, browser, id, "admin", "language-manager");
			await use({
				id,
				slug,
				manager,
				agent: async () => {
					agent ??= await joinOffice(admin, browser, id, "member", "language-agent");
					return agent;
				},
				newGuest: (text) => {
					const guestId = uniqueId("guest");
					return {
						id: guestId,
						text,
						write: () => deliverZalo(request, signedZaloText({ guestId, oaId, text })),
					};
				},
			});
		} finally {
			await agent?.close();
			await manager?.close();
			await releaseZaloOa(oaId);
			await deleteOffice(admin.api, id);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-office-language-${kind}-${randomUUID()}`;
}

/* ---------------------------------------------------------------- the office language API */

const LANGUAGE_API = "/api/office/language";

/**
 * `PUT /api/office/language` as whoever `request` is signed in as, sent as the app's own calls are
 * (with the Origin), so a refusal is about who asks. Redirects are not followed, so a signed-out
 * caller's answer is the API's own.
 */
function putLanguage(request: APIRequestContext, language: "en" | "vi") {
	return request.put(LANGUAGE_API, {
		data: { language },
		headers: { origin: appOrigin() },
		maxRedirects: 0,
	});
}

function getLanguage(request: APIRequestContext) {
	return request.get(LANGUAGE_API, { maxRedirects: 0 });
}

/** The manager sets the office language through the API behind the setting (setup in 4 and 5). */
async function managerSets(manager: Joined, language: "en" | "vi") {
	const res = await putLanguage(manager.page.request, language);
	expect(res.status(), `the manager sets the office language to "${language}"`).toBe(200);
}

/* ---------------------------------------------------------------- the thread */

/** The guest's thread id, once the manager's conversations API lists it. */
async function threadIdOf(manager: Api, guest: Guest): Promise<string> {
	let id: string | undefined;
	await expect(async () => {
		const res = await manager.get("/api/conversations");
		expect(res.status(), "the manager lists the office's threads").toBe(200);
		id = ((await res.json()) as { id: string; guestId: string }[]).find(
			(t) => t.guestId === guest.id,
		)?.id;
		expect(id, `the manager lists ${guest.id}`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return id!;
}

function openThread(page: Page) {
	return page.getByRole("article");
}

/** The guest's bubble in the open thread: their message, with its translation when it has one. */
function guestBubble(page: Page, guest: Guest) {
	return openThread(page).getByTestId("message").filter({ hasText: guest.text });
}

/** Opens the thread by its link, in the given interface language, the guest's message showing. */
async function openThreadByLink(page: Page, locale: Locale, threadId: string, guest: Guest) {
	await page.goto(`/${locale}/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(guestBubble(page, guest), "the thread holds the guest's message").toHaveCount(1);
}

/**
 * The open thread shows the guest's message translated by this line, within a poll, and no line
 * into English anywhere in it unless that is the line.
 */
async function expectTranslation(page: Page, guest: Guest, line: string, where: string) {
	await expect(
		guestBubble(page, guest),
		`${where}: the guest's message reads "${line}"`,
	).toContainText(line, WITHIN_A_POLL);
	if (!line.endsWith("to English.")) {
		await expect(
			openThread(page),
			`${where}: no line into English in the thread`,
		).not.toContainText(ANY_LINE_INTO_ENGLISH);
	}
}

/* ---------------------------------------------------------------- the setting */

function settingsAddress(locale: Locale, office: LanguageOffice) {
	return `/${locale}/${office.slug}/settings/general`;
}

/** The "Office language" setting's select: a combobox named by its title, showing its value. */
function languageSelect(page: Page, locale: Locale) {
	return page.getByRole("combobox", { name: SETTING.title[locale] });
}

/** The select shows this language as the office's, and not the other one. */
async function expectSettingReads(page: Page, locale: Locale, language: "English" | "Tiếng Việt") {
	const select = languageSelect(page, locale);
	const other = language === SETTING.english ? SETTING.vietnamese : SETTING.english;
	await expect(select, `the Office language setting reads "${language}"`).toContainText(language);
	await expect(select, `the Office language setting doesn't read "${other}"`).not.toContainText(
		other,
	);
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Office language 1
test.describe("Office language 1 — the manager sets the office language", () => {
	test('the manager\'s General tab has an "Office language" setting reading "English" (none set yet); choosing "Tiếng Việt" says "Office language saved", and after a reload it still reads "Tiếng Việt" (in VI, "Ngôn ngữ văn phòng")', async ({
		office,
	}) => {
		const { page } = office.manager;

		await page.goto(settingsAddress("en", office));
		await expect(
			languageSelect(page, "en"),
			'the General tab has an "Office language" setting',
		).toBeVisible();
		await expectSettingReads(page, "en", SETTING.english);

		await languageSelect(page, "en").click();
		const option = page.getByRole("option", { name: SETTING.vietnamese, exact: true });
		await expect(option, 'the setting offers "Tiếng Việt"').toBeVisible();
		await expect(
			page.getByRole("option", { name: SETTING.english, exact: true }),
			'the setting offers "English"',
		).toBeVisible();
		await option.click();
		await expect(
			page.getByText(SETTING.saved, { exact: true }),
			'choosing saves it at once: "Office language saved"',
		).toBeVisible();
		await expectSettingReads(page, "en", SETTING.vietnamese);

		await page.reload();
		await expect(languageSelect(page, "en")).toBeVisible();
		await expectSettingReads(page, "en", SETTING.vietnamese);

		await page.goto(settingsAddress("vi", office));
		await expect(
			languageSelect(page, "vi"),
			'in VI the setting is "Ngôn ngữ văn phòng"',
		).toBeVisible();
		await expectSettingReads(page, "vi", SETTING.vietnamese);
	});
});

// scenario: docs/e2e-scenarios.md Office language 2
test.describe("Office language 2 — an agent can't set it", () => {
	test("the agent's General tab is the not-found page; PUT /api/office/language refuses the agent (403) and a signed-out caller (401), and the language stays English; the agent reads it (GET answers en) and their open thread, read in /vi/, shows its translation into English", async ({
		office,
		request,
	}) => {
		const { manager } = office;
		const agent = await office.agent();
		const check = expect.configure({ soft: true });

		// Setup: a Korean guest, given to the agent by the manager.
		const guest = office.newGuest(KOREAN_TEXT);
		await guest.write();
		const threadId = await threadIdOf(manager.api, guest);
		await assignerAs(manager.api).assignTo(threadId, agent.userId);

		await test.step("the agent's General tab doesn't exist for them (Team 8's not-found page)", async () => {
			const opened = await agent.page.goto(settingsAddress("en", office));
			check(opened?.status(), "the agent's General tab answers 404").toBe(404);
			await check(
				agent.page.getByText(NOT_FOUND),
				"the agent sees the not-found page",
			).toBeVisible();
			await check(
				agent.page.getByText(SETTING.title.en),
				"no Office language setting on the agent's page",
			).toHaveCount(0);
		});

		await test.step("the API refuses the agent's change (403) and a signed-out caller's (401)", async () => {
			const byAgent = await putLanguage(agent.page.request, "vi");
			check(byAgent.status(), "PUT as the agent is refused").toBe(403);
			const signedOut = await putLanguage(request, "vi");
			check(signedOut.status(), "PUT signed out is refused").toBe(401);
		});

		await test.step("the language is unchanged, and the agent can read it", async () => {
			for (const [who, reader] of [
				["the manager", manager],
				["the agent", agent],
			] as const) {
				const res = await getLanguage(reader.page.request);
				check(res.status(), `${who} reads the office language`).toBe(200);
				check(
					res.ok() ? await res.json() : null,
					`${who} reads English: unchanged, the default`,
				).toMatchObject({ language: "en" });
			}
		});

		// Every refusal and read above is reported; the thread is judged whatever they answered.
		await test.step("the agent's open thread shows its translation in the office language, whatever their interface", async () => {
			await openThreadByLink(agent.page, "vi", threadId, guest);
			await expectTranslation(
				agent.page,
				guest,
				stubLine("Korean", "English"),
				"the agent, in /vi/",
			);
			await expect(
				openThread(agent.page),
				"no line into Vietnamese: the office is in English",
			).not.toContainText(stubLine("Korean", "Vietnamese"));
		});
	});
});

// scenario: docs/e2e-scenarios.md Office language 3
test.describe("Office language 3 — the platform admin's page for an office doesn't show it", () => {
	test('Admin → Organizations → the office shows no "Office language" (VI "Ngôn ngữ văn phòng") anywhere, and the office language API refuses the platform admin (403)', async ({
		office,
		admin,
	}) => {
		const check = expect.configure({ soft: true });

		for (const locale of ["en", "vi"] as const) {
			await test.step(`the office's admin page in ${locale.toUpperCase()}`, async () => {
				await admin.page.goto(`/${locale}/admin/organizations/${office.id}`);
				// The absence is judged once the page's Connections card has shown.
				await expect(
					admin.page.getByTestId("office-connections"),
					"the platform admin sees the office's page",
				).toBeVisible();
				await check(
					admin.page.getByText(SETTING.title[locale]),
					`no "${SETTING.title[locale]}" on the page`,
				).toHaveCount(0);
				await check(
					languageSelect(admin.page, locale),
					"no office language select on the page",
				).toHaveCount(0);
			});
		}

		await test.step("the API refuses the platform admin, as the inbox does", async () => {
			const read = await getLanguage(admin.page.request);
			check(read.status(), "GET as the platform admin is refused").toBe(403);
			// "en" only: the platform admin's session may name the walk office, and a build that wrongly
			// took a change must not move the walk office's language for every other spec.
			const change = await putLanguage(admin.page.request, "en");
			check(change.status(), "PUT as the platform admin is refused").toBe(403);
		});
	});
});

// scenario: docs/e2e-scenarios.md Office language 4
test.describe("Office language 4 — one translation, in the office language", () => {
	test('in a Vietnamese office, a Korean message shows "Stub translation, Korean to Vietnamese." and no line into English, in /vi/ and in /en/; a Vietnamese message shows no translation line', async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		await managerSets(manager, "vi");

		// The Vietnamese guest writes first, and their thread is opened once early, so whatever
		// translation a write or an opening would start is under way before the Korean line is awaited.
		const vietnamese = office.newGuest(VIETNAMESE_TEXT);
		await vietnamese.write();
		const vietnameseThread = await threadIdOf(manager.api, vietnamese);
		await openThreadByLink(page, "en", vietnameseThread, vietnamese);

		const korean = office.newGuest(KOREAN_TEXT);
		await korean.write();
		const koreanThread = await threadIdOf(manager.api, korean);

		await test.step("a Korean message is translated into Vietnamese, not English: in /vi/", async () => {
			await openThreadByLink(page, "vi", koreanThread, korean);
			await expectTranslation(page, korean, stubLine("Korean", "Vietnamese"), "in /vi/");
		});

		await test.step("…and in /en/ too: the translation follows the office, not the reader", async () => {
			await openThreadByLink(page, "en", koreanThread, korean);
			await expectTranslation(page, korean, stubLine("Korean", "Vietnamese"), "in /en/");
		});

		await test.step("a Vietnamese message shows no translation line (judged after the Korean line has shown)", async () => {
			await openThreadByLink(page, "en", vietnameseThread, vietnamese);
			const bubble = guestBubble(page, vietnamese);
			await expect(bubble, "no translation label on the Vietnamese message").not.toContainText(
				translationLabel("en"),
			);
			await expect(bubble, "no stub translation line on the Vietnamese message").not.toContainText(
				ANY_STUB_LINE,
			);
		});
	});

	test('in an office left at the default, a Korean message shows "Stub translation, Korean to English.", in /vi/ too', async ({
		office,
	}) => {
		const { manager } = office;
		const korean = office.newGuest(KOREAN_TEXT);
		await korean.write();
		const threadId = await threadIdOf(manager.api, korean);

		await openThreadByLink(manager.page, "vi", threadId, korean);
		await expectTranslation(manager.page, korean, stubLine("Korean", "English"), "in /vi/");
		await expect(
			openThread(manager.page),
			"no line into Vietnamese: the office is in English",
		).not.toContainText(stubLine("Korean", "Vietnamese"));
	});
});

// scenario: docs/e2e-scenarios.md Office language 5
test.describe("Office language 5 — after a change, an older thread is translated when it's opened", () => {
	test('in an English office a Korean thread shows "Stub translation, Korean to English."; once the manager switches the office to Vietnamese, opening it again shows "Stub translation, Korean to Vietnamese." and no line into English', async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const korean = office.newGuest(KOREAN_TEXT);
		await korean.write();
		const threadId = await threadIdOf(manager.api, korean);

		await test.step("in the English office, the thread reads its translation into English", async () => {
			await openThreadByLink(page, "en", threadId, korean);
			await expectTranslation(page, korean, stubLine("Korean", "English"), "before the change");
		});

		await managerSets(manager, "vi");

		await test.step("opened again after the change, it reads its translation into Vietnamese, and the English line is gone", async () => {
			await page.goto("/en/home");
			await openThreadByLink(page, "en", threadId, korean);
			await expectTranslation(page, korean, stubLine("Korean", "Vietnamese"), "after the change");
		});
	});
});
