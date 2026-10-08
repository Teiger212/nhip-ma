import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import type { AlertRow } from "./support/alerts";
import { alertState } from "./support/alerts";
import { assignerAs } from "./support/assign";
import type { Locale } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import type { OwnOffice } from "./support/own-office";
import { threadIdOf, threadLink, withOwnOffice } from "./support/own-office";
import { officeUrlOf } from "./support/seed";
import { appOrigin } from "./support/session";
import { setTranslationsToday, TRANSLATE_DAILY_CAP } from "./support/translations";

/* ---------------------------------------------------------------- what the scenarios promise */

/**
 * The setting's own words (docs/e2e-scenarios.md, Office language; ADR 0025), written out rather
 * than read from saas.json: they are the contract. The VI copy is pending a native read (#78).
 */
const SETTING = {
	title: { en: "Office language", vi: "Ngôn ngữ văn phòng" },
	english: "English",
	vietnamese: "Tiếng Việt",
	/** The VI toast is the app's own (saas.json), accepted only because the page may move to /vi/. */
	saved: { en: "Office language saved", vi: "Đã lưu ngôn ngữ văn phòng" },
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
type LanguageOffice = Omit<OwnOffice, "newGuest"> & {
	/** A guest who has not written yet, who will write `text` on the office's OA. */
	newGuest: (text: string) => Guest;
};

const test = base.extend<{ office: LanguageOffice }>({
	office: ({ admin, browser, request }, use) =>
		withOwnOffice(
			{ admin, browser, request },
			{ tag: "office-language", name: "Office Language Test" },
			(office) =>
				use({
					...office,
					newGuest: (text) => {
						const guest = office.newGuest();
						return { id: guest.id, text, write: () => guest.write(text) };
					},
				}),
		),
});

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

function openThread(page: Page) {
	return page.getByRole("article");
}

/** The guest's bubble in the open thread: their message, with its translation when it has one. */
function guestBubble(page: Page, guest: Guest) {
	return openThread(page).getByTestId("message").filter({ hasText: guest.text });
}

/** Opens the thread by its link, in the given interface language, the guest's message showing. */
async function openThreadByLink(page: Page, locale: Locale, threadId: string, guest: Guest) {
	await page.goto(threadLink(threadId, locale));
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

/** The page's address is exactly this path. */
function isAt(path: string) {
	return (url: URL) => url.pathname === path;
}

/** A redirect lands within a page load; the build under load gets a margin. */
const ON_LOAD = { timeout: 15_000 };

function settingsAddress(locale: Locale, office: LanguageOffice) {
	return officeUrlOf(office.slug, "settings/general", locale);
}

/** The "Office language" setting's select: a combobox named by its title, showing its value. */
function languageSelect(page: Page, locale: Locale) {
	return page.getByRole("combobox", { name: SETTING.title[locale] });
}

/**
 * The setting's select in whichever language the page is in: choosing a language moves the
 * manager's page to it (Office language 6), so after a choice the page may be either.
 */
function languageSelectInEither(page: Page) {
	return page.getByRole("combobox", {
		name: new RegExp(`^(${SETTING.title.en}|${SETTING.title.vi})$`),
	});
}

/** The select shows this language as the office's, and not the other one. */
async function expectSettingReads(
	page: Page,
	locale: Locale | "either",
	language: "English" | "Tiếng Việt",
) {
	const select = locale === "either" ? languageSelectInEither(page) : languageSelect(page, locale);
	const other = language === SETTING.english ? SETTING.vietnamese : SETTING.english;
	await expect(select, `the Office language setting reads "${language}"`).toContainText(language);
	await expect(select, `the Office language setting doesn't read "${other}"`).not.toContainText(
		other,
	);
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Office language 1
// scenario: docs/e2e-scenarios.md Office language 6
test.describe("Office language 1 and 6 — the manager sets the office language, and their page follows it", () => {
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
		// The page may move to /vi/ on choosing (Office language 6): the toast and the setting are
		// read in either language from here.
		await expect(
			page.getByText(new RegExp(`^(${SETTING.saved.en}|${SETTING.saved.vi})$`)),
			'choosing saves it at once: "Office language saved" (VI "Đã lưu ngôn ngữ văn phòng")',
		).toBeVisible();

		await test.step('the manager switches the office from English to Vietnamese on the General tab: their page becomes /vi/<office slug>/settings/general, where "Ngôn ngữ văn phòng" reads "Tiếng Việt"', async () => {
			await expect(page, "the manager's page moves to the Vietnamese prefix, same page").toHaveURL(
				isAt(settingsAddress("vi", office)),
				ON_LOAD,
			);
			await expect(
				languageSelect(page, "vi"),
				'the page is in Vietnamese: "Ngôn ngữ văn phòng"',
			).toBeVisible();
			await expectSettingReads(page, "vi", SETTING.vietnamese);
		});

		await expectSettingReads(page, "either", SETTING.vietnamese);

		await page.reload();
		await expect(languageSelectInEither(page)).toBeVisible();
		await expectSettingReads(page, "either", SETTING.vietnamese);

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
		const threadId = await threadIdOf(manager.api, guest.id);
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
		admin,
	}) => {
		const check = expect.configure({ soft: true });
		// Only the office's id is used: an office with no OA and no member will do (deleted by `admin`).
		const office = await admin.createOffice("office-language");

		const adminPage = await admin.openPage();
		for (const locale of ["en", "vi"] as const) {
			await test.step(`the office's admin page in ${locale.toUpperCase()}`, async () => {
				await adminPage.goto(`/${locale}/admin/organizations/${office.id}`);
				// The absence is judged once the page's Connections card has shown.
				await expect(
					adminPage.getByTestId("office-connections"),
					"the platform admin sees the office's page",
				).toBeVisible();
				await check(
					adminPage.getByText(SETTING.title[locale]),
					`no "${SETTING.title[locale]}" on the page`,
				).toHaveCount(0);
				await check(
					languageSelect(adminPage, locale),
					"no office language select on the page",
				).toHaveCount(0);
			});
		}

		await test.step("the API refuses the platform admin, as the inbox does", async () => {
			const read = await getLanguage(admin.request);
			check(read.status(), "GET as the platform admin is refused").toBe(403);
			// "en" only: the platform admin's session may name the walk office, and a build that wrongly
			// took a change must not move the walk office's language for every other spec.
			const change = await putLanguage(admin.request, "en");
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
		const vietnameseThread = await threadIdOf(manager.api, vietnamese.id);
		await openThreadByLink(page, "en", vietnameseThread, vietnamese);

		const korean = office.newGuest(KOREAN_TEXT);
		await korean.write();
		const koreanThread = await threadIdOf(manager.api, korean.id);

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
			// The /en/ link lands on /vi/ for a member (6): the label is looked for in both languages.
			for (const locale of ["en", "vi"] as const) {
				await expect(
					bubble,
					`no translation label on the Vietnamese message ("${translationLabel(locale)}")`,
				).not.toContainText(translationLabel(locale));
			}
			await expect(bubble, "no stub translation line on the Vietnamese message").not.toContainText(
				ANY_STUB_LINE,
			);
		});
	});
});

/* ---------------------------------------------------------------- the user menu and account settings */

/**
 * The interface's own words, which are how a person finds things (saas.json `app.userMenu`,
 * `settings.account`, `inbox.views`, `home`): the user menu's Language row and Log out, the account
 * settings' title, its "Your name" and "Your language" items, the agent's Your turn tab and Home's
 * Waiting now.
 */
const UI = {
	en: {
		language: "Language",
		logOut: "Log out",
		accountSettings: "Account settings",
		yourName: "Your name",
		yourLanguage: "Your language",
		yourTurn: "Your turn",
		waitingNow: "Waiting now",
	},
	vi: {
		language: "Ngôn ngữ",
		logOut: "Đăng xuất",
		accountSettings: "Cài đặt tài khoản",
		yourName: "Tên của bạn",
		yourLanguage: "Ngôn ngữ của bạn",
		yourTurn: "Đến lượt bạn",
		waitingNow: "Đang chờ",
	},
} as const;

/** The user menu's EN/VI toggle: its two buttons, named by the language each chooses. */
const TOGGLE = { en: "English", vi: "Tiếng Việt" } as const;

/** Opens the user menu: the ⋯ beside the person's name in the expanded desktop sidebar (Team 1). */
async function openUserMenu(page: Page, locale: Locale) {
	await page.getByRole("button", { name: "User menu" }).click();
	// Whatever the menu holds is judged once it has opened: Log out is in every person's.
	await expect(
		page.getByRole("menuitem", { name: UI[locale].logOut, exact: true }),
		"the user menu is open",
	).toBeVisible();
}

function userMenu(page: Page) {
	return page.getByRole("menu", { name: "User menu" });
}

/** The menu's Language row: its label, and the toggle's two buttons. */
function languageRow(page: Page, locale: Locale) {
	const menu = userMenu(page);
	return {
		label: menu.getByText(UI[locale].language, { exact: true }),
		english: menu.getByRole("button", { name: TOGGLE.en, exact: true }),
		vietnamese: menu.getByRole("button", { name: TOGGLE.vi, exact: true }),
	};
}

/** Account settings, General, loaded: its title and the "Your name" item have shown. */
async function openAccountSettings(page: Page, locale: Locale) {
	await page.goto(`/${locale}/settings/general`);
	const main = page.getByRole("main");
	await expect(
		main.getByRole("heading", { name: UI[locale].accountSettings, exact: true }),
		"account settings open",
	).toBeVisible();
	await expect(
		main.getByRole("heading", { name: UI[locale].yourName, exact: true }),
		'account settings show "Your name"',
	).toBeVisible();
}

/** The account settings' language item: its title, and the select under it. */
function languageSetting(page: Page, locale: Locale) {
	const main = page.getByRole("main");
	return {
		title: main.getByRole("heading", { name: UI[locale].yourLanguage, exact: true }),
		select: main.getByRole("combobox"),
	};
}

/** The agent's Your turn tab, in the Inbox's list: "Your turn N" (VI "Đến lượt bạn N"). */
function yourTurnTab(page: Page, locale: Locale) {
	return page
		.getByRole("complementary")
		.getByRole("button", { name: new RegExp(`^${UI[locale].yourTurn} \\d+$`) });
}

// scenario: docs/e2e-scenarios.md Office language 6
test.describe("Office language 6 — members read Nhịp in the office language", () => {
	test("in a Vietnamese office, the agent's /en/inbox lands on /vi/inbox, in Vietnamese; /en/inbox?thread=<id> lands on /vi/inbox with that thread open; the manager's /en/home lands on /vi/home; the agent's user menu has no language toggle and their account settings no language select; nor do the manager's", async ({
		office,
	}) => {
		const { manager } = office;
		const agent = await office.agent();
		const check = expect.configure({ soft: true });
		await managerSets(manager, "vi");

		// Setup: two guests the manager gave the agent. The older heads the agent's queue, so an
		// Inbox that opens the first guest can't pass for the link keeping its thread (the newer).
		const older = office.newGuest(KOREAN_TEXT);
		await older.write();
		const assigner = assignerAs(manager.api);
		await assigner.assignTo(await threadIdOf(manager.api, older.id), agent.userId);
		const guest = office.newGuest(VIETNAMESE_TEXT);
		await guest.write();
		const threadId = await threadIdOf(manager.api, guest.id);
		await assigner.assignTo(threadId, agent.userId);

		await test.step("the agent's /en/inbox lands on /vi/inbox, in Vietnamese", async () => {
			await agent.page.goto("/en/inbox");
			await check(agent.page, "the agent lands on /vi/inbox").toHaveURL(isAt("/vi/inbox"), ON_LOAD);
			await check(
				yourTurnTab(agent.page, "vi"),
				`the Inbox is in Vietnamese: "${UI.vi.yourTurn}"`,
			).toBeVisible();
		});

		await test.step("a thread's /en/ link lands on /vi/ with that thread open", async () => {
			await agent.page.goto(`/en/inbox?thread=${encodeURIComponent(threadId)}`);
			// "Keeps its thread" is the thread open: the Inbox takes `?thread=` out of the address once
			// it has opened it (as after an alert's link, Alerts 8), so the address is judged by its path.
			await check(agent.page, "the link lands on /vi/inbox").toHaveURL(isAt("/vi/inbox"), ON_LOAD);
			await check(
				guestBubble(agent.page, guest),
				"the linked thread is open, the guest's message in it",
			).toHaveCount(1);
			await check(guestBubble(agent.page, older), "not the guest heading the queue").toHaveCount(0);
		});

		await test.step("the manager's /en/home lands on /vi/home", async () => {
			await manager.page.goto("/en/home");
			await check(manager.page, "the manager lands on /vi/home").toHaveURL(
				isAt("/vi/home"),
				ON_LOAD,
			);
			await check(
				manager.page.getByRole("main").getByRole("heading", { name: UI.vi.waitingNow }),
				`Home is in Vietnamese: "${UI.vi.waitingNow}"`,
			).toBeVisible();
		});

		await test.step("in a Vietnamese office, the agent's user menu has no language toggle and their account settings no language select; nor do the manager's", async () => {
			for (const [who, { page }] of [
				["the agent", agent],
				["the manager", manager],
			] as const) {
				await test.step(`${who}'s user menu has no Language row`, async () => {
					await page.goto("/vi/inbox");
					await openUserMenu(page, "vi");
					const row = languageRow(page, "vi");
					await check(row.label, `${who}'s menu has no "${UI.vi.language}"`).toHaveCount(0);
					await check(row.english, `${who}'s menu has no "${TOGGLE.en}" button`).toHaveCount(0);
					await check(row.vietnamese, `${who}'s menu has no "${TOGGLE.vi}" button`).toHaveCount(0);
					await page.keyboard.press("Escape");
				});

				await test.step(`${who}'s account settings have no language select`, async () => {
					await openAccountSettings(page, "vi");
					const setting = languageSetting(page, "vi");
					await check(setting.title, `no "${UI.vi.yourLanguage}" in ${who}'s settings`).toHaveCount(
						0,
					);
					await check(setting.select, `no select in ${who}'s account settings`).toHaveCount(0);
				});
			}
		});
	});
});

// scenario: docs/e2e-scenarios.md Office language 7
test.describe("Office language 7 — the platform admin keeps their own language", () => {
	test("the platform admin's user menu still has the EN/VI toggle, which moves /en/admin/organizations to /vi/admin/organizations and back; their account settings still have the language select", async ({
		admin,
	}) => {
		const page = await admin.openPage();
		await page.goto("/en/admin/organizations");
		await expect(page.getByTestId("admin-organizations-search")).toBeVisible();

		await openUserMenu(page, "en");
		const row = languageRow(page, "en");
		await expect(row.label, `the menu has its "${UI.en.language}" row`).toBeVisible();
		await expect(row.english, "with English chosen").toHaveAttribute("aria-pressed", "true");
		await row.vietnamese.click();
		await expect(page, "Tiếng Việt moves the page to /vi/").toHaveURL(
			isAt("/vi/admin/organizations"),
			ON_LOAD,
		);
		await expect(page.getByTestId("admin-organizations-search")).toBeVisible();

		await openUserMenu(page, "vi");
		const vi = languageRow(page, "vi");
		await expect(vi.label, `in Vietnamese the row is "${UI.vi.language}"`).toBeVisible();
		await vi.english.click();
		await expect(page, "English moves it back to /en/").toHaveURL(
			isAt("/en/admin/organizations"),
			ON_LOAD,
		);

		for (const locale of ["en", "vi"] as const) {
			await openAccountSettings(page, locale);
			const setting = languageSetting(page, locale);
			await expect(
				setting.title,
				`(${locale}) the account settings have "${UI[locale].yourLanguage}"`,
			).toBeVisible();
			await expect(setting.select, `(${locale}) with its select`).toBeVisible();
		}
	});
});

/* ---------------------------------------------------------------- alerts (Office language 8) */

/** The kit's session, as the signed-in person's own browser reads it. */
async function ownLocale(person: Joined): Promise<string | null> {
	const res = await person.api.get("/api/auth/get-session");
	expect(res.status(), "the session is readable").toBe(200);
	return ((await res.json()) as { user: { locale?: string | null } }).user.locale ?? null;
}

/** The person sets their own language, through the kit's user update (setup). */
async function setOwnLocale(person: Joined, locale: Locale) {
	const res = await person.api.post("/api/auth/update-user", { locale });
	expect(res.ok(), `the person sets their own language (${res.status()})`).toBe(true);
	expect(await ownLocale(person), `their own language is "${locale}"`).toBe(locale);
}

/** Alerts are decided in the background (ADR 0019): the log is polled. */
const ON_THE_PHONES = { timeout: 30_000 };

/** The person's alert of this kind on the thread, once the log holds it (Alerts 1's log). */
async function alertFor(
	office: LanguageOffice,
	person: Joined,
	threadId: string,
	kind: AlertRow["kind"],
): Promise<AlertRow> {
	const mine = async () =>
		(await alertState.alerts(office.id)).filter(
			(r) => r.userId === person.userId && r.conversationId === threadId && r.kind === kind,
		);
	await expect
		.poll(async () => (await mine()).length, {
			...ON_THE_PHONES,
			message: `the log holds the person's ${kind} alert on the thread`,
		})
		.toBeGreaterThanOrEqual(1);
	return (await mine())[0]!;
}

/** The bell's row for a thread a manager gave the person (saas.json `app.notifications`). */
const GAVE_YOU_A_THREAD = {
	en: "A manager gave you a thread",
	vi: "Một quản lý đã giao cho bạn một cuộc trò chuyện",
} as const;

const OPEN_BELL = { en: "Open notifications", vi: "Mở thông báo" } as const;
const BELL_TITLE = { en: "Notifications", vi: "Thông báo" } as const;

// scenario: docs/e2e-scenarios.md Office language 8
test.describe("Office language 8 — alerts follow the office", () => {
	test("a new guest writes to a Vietnamese office whose manager is set to English: the manager's alert link starts with /vi/", async ({
		office,
	}) => {
		const { manager } = office;
		await managerSets(manager, "vi");
		await setOwnLocale(manager, "en");

		const guest = office.newGuest(VIETNAMESE_TEXT);
		await guest.write();
		const threadId = await threadIdOf(manager.api, guest.id);

		const alert = await alertFor(office, manager, threadId, "guest");
		expect(alert.link, "the manager's alert opens the Inbox in the office language").toMatch(
			/^\/vi\/inbox\?alert=/,
		);
	});

	test(`the bell follows the office: an agent of a Vietnamese office, set to English, reads "${GAVE_YOU_A_THREAD.vi}" when the manager gives them a thread`, async ({
		office,
	}) => {
		const { manager } = office;
		const agent = await office.agent();
		await managerSets(manager, "vi");
		await setOwnLocale(agent, "en");

		const guest = office.newGuest(VIETNAMESE_TEXT);
		await guest.write();
		const threadId = await threadIdOf(manager.api, guest.id);
		await assignerAs(manager.api).assignTo(threadId, agent.userId);
		// The assignment has been decided: its alert is in the log (Alerts 3).
		await alertFor(office, agent, threadId, "assigned");

		// The agent opens their settings as their own English would have it: the office decides.
		const { page } = agent;
		await page.goto("/en/settings/general");
		await page
			.getByRole("button", { name: new RegExp(`^(${OPEN_BELL.en}|${OPEN_BELL.vi})$`) })
			.click();
		const shown = (text: string | RegExp) =>
			page.getByText(text, { exact: true }).locator("visible=true");
		await expect(
			shown(new RegExp(`^(${BELL_TITLE.en}|${BELL_TITLE.vi})$`)).first(),
			"the bell opens",
		).toBeVisible();
		// Both are reported: the row in the office's Vietnamese, and none in the agent's English.
		await expect
			.soft(shown(GAVE_YOU_A_THREAD.vi), `the bell reads "${GAVE_YOU_A_THREAD.vi}"`)
			.toHaveCount(1, WITHIN_A_POLL);
		await expect.soft(shown(GAVE_YOU_A_THREAD.en), "not in the agent's own English").toHaveCount(0);
	});
});

/* ---------------------------------------------------------------- the kept translation (Office language 10) */

/**
 * A kept translation's visible label, naming the language it is in (Office language 10, written
 * out: it is the contract). The VI copy is pending a native read (#78).
 */
const KEPT_ENGLISH_LABEL = {
	en: /Translation\s*·\s*English/,
	vi: /Bản dịch\s*·\s*tiếng Anh/,
} as const;

/**
 * Any labelled translation, in either interface: "Translation · …" or "Bản dịch · …". A
 * translation in the office language has none; only its visually hidden "Translation" prefix,
 * which no "·" follows.
 */
const ANY_VISIBLE_TRANSLATION_LABEL = /(Translation|Bản dịch)\s*·/;

// scenario: docs/e2e-scenarios.md Office language 10
test.describe("Office language 10 — until the new language's translation lands, the kept one shows, labelled", () => {
	test('an English office\'s Korean thread reads "Stub translation, Korean to English." unlabelled; with the day\'s translations spent and the office switched to Vietnamese, it reads that line labelled "Bản dịch · tiếng Anh" and no line into Vietnamese, the Vietnamese guest\'s message no line; back under the cap, "Stub translation, Korean to Vietnamese." unlabelled and the English line gone', async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const check = expect.configure({ soft: true });

		const korean = office.newGuest(KOREAN_TEXT);
		await korean.write();
		const koreanThread = await threadIdOf(manager.api, korean.id);
		const vietnamese = office.newGuest(VIETNAMESE_TEXT);
		await vietnamese.write();
		const vietnameseThread = await threadIdOf(manager.api, vietnamese.id);

		await test.step("in the English office, both guests' messages read their translation into English, with no visible label", async () => {
			await openThreadByLink(page, "en", koreanThread, korean);
			await expectTranslation(page, korean, stubLine("Korean", "English"), "the Korean guest");
			await expect(
				guestBubble(page, korean),
				"a translation in the office language has no visible label",
			).not.toContainText(ANY_VISIBLE_TRANSLATION_LABEL);

			await openThreadByLink(page, "en", vietnameseThread, vietnamese);
			await expectTranslation(
				page,
				vietnamese,
				stubLine("Vietnamese", "English"),
				"the Vietnamese guest",
			);
		});

		// Setup, once both lines have shown (no translation is still under way): the office's day
		// has no translations left, then the manager switches the office to Vietnamese.
		await setTranslationsToday(office.id, TRANSLATE_DAILY_CAP);
		await managerSets(manager, "vi");

		await test.step("past the cap, the Korean message keeps its English line, labelled, and gets no line into Vietnamese", async () => {
			await page.goto("/vi/home");
			await openThreadByLink(page, "vi", koreanThread, korean);
			const bubble = guestBubble(page, korean);
			// Both are reported: the kept line and its label, and no new line (no model call).
			await check(bubble, "the guest's message keeps its English line").toContainText(
				stubLine("Korean", "English"),
				WITHIN_A_POLL,
			);
			await check(bubble, 'the English line is labelled "Bản dịch · tiếng Anh"').toContainText(
				KEPT_ENGLISH_LABEL.vi,
			);
			await check(
				openThread(page),
				"no line into Vietnamese: past the cap, no model call",
			).not.toContainText(stubLine("Korean", "Vietnamese"));
		});

		await test.step("the Vietnamese guest's message shows no line: it is in the office language now", async () => {
			await openThreadByLink(page, "vi", vietnameseThread, vietnamese);
			const bubble = guestBubble(page, vietnamese);
			for (const locale of ["en", "vi"] as const) {
				await check(
					bubble,
					`no translation label on the Vietnamese message ("${translationLabel(locale)}")`,
				).not.toContainText(translationLabel(locale));
			}
			await check(bubble, "no stub translation line on the Vietnamese message").not.toContainText(
				ANY_STUB_LINE,
			);
		});

		await test.step("opened again, still past the cap, the Korean message still reads only its labelled English line", async () => {
			// A second opening is a second chance for a translation: none comes past the cap.
			await openThreadByLink(page, "vi", koreanThread, korean);
			const bubble = guestBubble(page, korean);
			await check(bubble, "still the labelled English line").toContainText(KEPT_ENGLISH_LABEL.vi);
			await check(openThread(page), "still no line into Vietnamese").not.toContainText(
				stubLine("Korean", "Vietnamese"),
			);
		});

		// Every past-the-cap check above is reported; the day's translations come back regardless.
		await setTranslationsToday(office.id, 0);

		await test.step("back under the cap, opening the Korean thread reads its translation into Vietnamese, unlabelled, and the labelled English line is gone", async () => {
			await page.goto("/vi/home");
			await openThreadByLink(page, "vi", koreanThread, korean);
			await expectTranslation(page, korean, stubLine("Korean", "Vietnamese"), "back under the cap");
			const bubble = guestBubble(page, korean);
			await expect(bubble, "the kept English line's label is gone").not.toContainText(
				KEPT_ENGLISH_LABEL.vi,
			);
			await expect(
				bubble,
				"a translation in the office language has no visible label",
			).not.toContainText(ANY_VISIBLE_TRANSLATION_LABEL);
		});
	});
});
