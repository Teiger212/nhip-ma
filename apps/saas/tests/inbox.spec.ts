import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/** On the login page: the sign-in form is there (AGENTS.md: no auth bypass route). */
async function expectLoginForm(page: Page) {
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

/** The operator's remembered language (ARCHITECTURE.md "Locale routing": cookie `NEXT_LOCALE`). */
async function rememberVietnamese(context: BrowserContext, baseURL: string | undefined) {
	await context.addCookies([{ name: "NEXT_LOCALE", value: "vi", url: baseURL ?? "" }]);
}

// rule: ARCHITECTURE.md "What the product uses" and "Locale routing"
test.describe("ARCHITECTURE.md locale routing — signed-out inbox entry", () => {
	// rule: `/inbox` → `/{locale}/inbox`, the cookie remembering the preference for unprefixed
	// paths; signed out, the inbox asks for a login (AGENTS.md: there is no auth bypass route).
	test("unprefixed inbox sends the operator to login in their language", async ({
		page,
		context,
		baseURL,
	}) => {
		await page.goto("/inbox");
		await expect(page).toHaveURL(/\/en\/login/);
		await expectLoginForm(page);

		await rememberVietnamese(context, baseURL);
		await page.goto("/inbox");
		await expect(page).toHaveURL(/\/vi\/login/);
		await expectLoginForm(page);
	});

	// rule: locale prefixes are required and kept.
	test("locale-prefixed inbox routes keep their prefix on login", async ({ page }) => {
		await page.goto("/en/inbox");
		await expect(page).toHaveURL(/\/en\/login/);
		await page.goto("/vi/inbox");
		await expect(page).toHaveURL(/\/vi\/login/);
	});

	// rule: bare `/` redirects to `/en/inbox`; it runs before the proxy, so it is English by
	// design, even for an operator who chose Vietnamese.
	test("root goes to the English inbox walk, whatever language is remembered", async ({
		page,
		context,
		baseURL,
	}) => {
		await rememberVietnamese(context, baseURL);
		await page.goto("/");
		await expect(page).toHaveURL(/\/en\/login/);
		await expectLoginForm(page);
	});
});
