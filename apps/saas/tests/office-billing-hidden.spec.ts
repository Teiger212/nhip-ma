import type { Browser, Page } from "@playwright/test";

import type { Admin } from "./support/fixtures";
import { expect, test } from "./support/fixtures";
import { officeSlug, setOfficeLanguage } from "./support/office-language";
import { joinOffice } from "./support/operators";
import type { Login } from "./support/seed";
import { AGENT, MANAGER } from "./support/seed";
import { signInContext } from "./support/session-state";

type Locale = "en" | "vi";

/** The walk office's slug (seed): its settings live under `/<locale>/walk/settings/…`. */
const WALK_SLUG = "walk";

/** The not-found page, as each language says it (spelled out: it is what this spec proves). */
const NOT_FOUND = {
	en: { heading: "404", message: "Page not found", back: "Go to dashboard" },
	vi: { heading: "404", message: "Không tìm thấy trang", back: "Về bảng điều khiển" },
} as const;

/** The account's Billing page: hidden already (kit-screens), the reference for a hidden screen. */
const accountBilling = (locale: Locale) => `/${locale}/settings/billing`;

/** The office's Billing page, hidden until ADR 0014's billing is built (#198). */
const officeBilling = (locale: Locale, slug: string) => `/${locale}/${slug}/settings/billing`;

/** Opens a page as a person would, by its address; answers the status the page came with. */
async function open(page: Page, url: string): Promise<number> {
	const res = await page.goto(url);
	expect(res, `${url} answers`).not.toBeNull();
	return res!.status();
}

/** The not-found page, and nothing of Billing on it. */
async function expectNotFound(page: Page, locale: Locale, what: string) {
	const copy = NOT_FOUND[locale];
	await expect(
		page.getByRole("heading", { name: copy.heading, exact: true }),
		`${what}: the not-found page`,
	).toBeVisible();
	await expect(
		page.getByText(copy.message, { exact: true }),
		`${what}: it says the page isn't found`,
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: copy.back, exact: true }),
		`${what}: with its way back`,
	).toBeVisible();
	await expect(page.getByText("Choose plan"), `${what}: no plan to choose`).toHaveCount(0);
	await expect(
		page.getByText(/^(Pro|Lifetime|Enterprise)$/),
		`${what}: no plans listed`,
	).toHaveCount(0);
	if (locale === "en") {
		await expect(
			page.getByRole("heading", { name: "Billing" }),
			`${what}: no Billing page`,
		).toHaveCount(0);
		await expect(
			page.getByRole("heading", { name: "Your plan" }),
			`${what}: no plan shown`,
		).toHaveCount(0);
	}
}

/** `who`, signed in by their minted session (setup), in a browser of their own. */
async function signedIn(browser: Browser, who: Login) {
	const context = await browser.newContext();
	await signInContext(context, who);
	return { page: await context.newPage(), slug: WALK_SLUG, close: () => context.close() };
}

/**
 * The manager of a Vietnamese office of the test's own (ADR 0025: a member reads Nhịp in the office
 * language; never the walk office, whose language would reach every other spec).
 */
async function vietnameseOfficeManager(admin: Admin, browser: Browser) {
	const office = await admin.createOffice("Billing hidden VI");
	const manager = await joinOffice(admin, browser, office.id, "admin", "billing-vi-manager");
	try {
		await setOfficeLanguage(manager.page.request, "vi");
		return {
			page: manager.page,
			slug: await officeSlug(admin.api, office.id),
			close: manager.close,
		};
	} catch (error) {
		await manager.close();
		throw error;
	}
}

// scenario: docs/e2e-scenarios.md Hidden kit screens 1
test.describe("Hidden kit screens 1 — the office's Billing page is hidden, as the account's is", () => {
	const cases: { role: string; locale: Locale; office: string; who: Login | "vi-manager" }[] = [
		{ who: MANAGER, role: "manager", locale: "en", office: "the walk office" },
		{ who: "vi-manager", role: "manager", locale: "vi", office: "a Vietnamese office" },
		{ who: AGENT, role: "agent", locale: "en", office: "the walk office" },
	];

	for (const { who, role, locale, office } of cases) {
		test(`${locale.toUpperCase()}: ${office}'s ${role}, opening the office's Billing address, gets the same status and the same not-found page as the account's hidden Billing page`, async ({
			admin,
			browser,
		}) => {
			const person =
				who === "vi-manager"
					? await vietnameseOfficeManager(admin, browser)
					: await signedIn(browser, who);
			const { page } = person;
			try {
				// The reference: the account's Billing page, hidden in kit-screens.
				const reference = await open(page, accountBilling(locale));
				expect(reference, "the account's hidden Billing page answers not found").toBe(404);
				await expectNotFound(page, locale, "the account's Billing page");

				// The office's Billing page gives the same.
				const status = await open(page, officeBilling(locale, person.slug));
				expect(status, "the office's Billing page answers as the account's hidden one does").toBe(
					reference,
				);
				await expectNotFound(page, locale, "the office's Billing page");
			} finally {
				await person.close();
			}
		});
	}
});
