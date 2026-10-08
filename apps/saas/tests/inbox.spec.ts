import type { BrowserContext, Page } from "@playwright/test";

import type { Locale } from "./support/copy";
import { loginCopy } from "./support/copy";
import { expect, test } from "./support/fixtures";
import { LoginPage } from "./support/login-page";
import { appOrigin } from "./support/session";

/**
 * On the login page: the sign-in form is there (AGENTS.md: no auth bypass route), in the
 * page's language (PRODUCT.md "English and Vietnamese only").
 */
async function expectLoginForm(page: Page, locale: Locale) {
	await expect(new LoginPage(page).submit).toHaveText(loginCopy(locale).submit);
}

/** The operator's remembered language (ARCHITECTURE.md "Locale routing": cookie `NEXT_LOCALE`). */
async function rememberVietnamese(context: BrowserContext) {
	await context.addCookies([{ name: "NEXT_LOCALE", value: "vi", url: appOrigin() }]);
}

// rule: ARCHITECTURE.md "What the product uses" and "Locale routing"
test.describe("ARCHITECTURE.md locale routing — signed-out inbox entry", () => {
	// rule: `/inbox` → `/{locale}/inbox`, the cookie remembering the preference for unprefixed
	// paths; signed out, the inbox asks for a login (AGENTS.md: there is no auth bypass route).
	// rule (first step): locale prefixes are required and kept.
	test("locale-prefixed inbox routes keep their prefix on login, and unprefixed inbox sends the operator to login in their language", async ({
		page,
		context,
	}) => {
		await test.step("locale-prefixed inbox routes keep their prefix on login", async () => {
			await page.goto("/en/inbox");
			await expect(page).toHaveURL(/\/en\/login/);
			await page.goto("/vi/inbox");
			await expect(page).toHaveURL(/\/vi\/login/);
		});

		// The prefixed visits may have remembered a language: start with none remembered.
		await context.clearCookies();

		await test.step("unprefixed inbox sends the operator to login in their language", async () => {
			await page.goto("/inbox");
			await expect(page).toHaveURL(/\/en\/login/);
			await expectLoginForm(page, "en");

			await rememberVietnamese(context);
			await page.goto("/inbox");
			await expect(page).toHaveURL(/\/vi\/login/);
			await expectLoginForm(page, "vi");
		});
	});

	// rule: bare `/` redirects to `/en/inbox`; it runs before the proxy, so it is English by
	// design, even for an operator who chose Vietnamese.
	test("root goes to the English inbox walk, whatever language is remembered", async ({
		page,
		context,
	}) => {
		await rememberVietnamese(context);
		await page.goto("/");
		await expect(page).toHaveURL(/\/en\/login/);
		await expectLoginForm(page, "en");
	});
});
