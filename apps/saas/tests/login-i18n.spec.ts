import type { Page } from "@playwright/test";

import type { LoginCopy } from "./support/copy";
import { loginCopy } from "./support/copy";
import { expect, test } from "./support/fixtures";
import { AGENT } from "./support/seed";

const en = loginCopy("en");

/** Signs in by what each field says, in the page's language: the labels are the point here. */
async function signInByLabels(page: Page, copy: LoginCopy) {
	await page.getByRole("tab", { name: copy.modes.password }).click();
	await page.getByLabel("Email", { exact: true }).fill(AGENT.email);
	await page.getByLabel(copy.password, { exact: true }).fill(AGENT.password);
	await page.getByRole("button", { name: copy.submit, exact: true }).click();
}

// rule: PRODUCT.md "English and Vietnamese only." The Vietnamese login page's copy is held by
// the translation-key check (modules/i18n/lib/translation-keys.test.ts, #278); the form is the same.
test.describe("PRODUCT.md English and Vietnamese only — the login page speaks both", () => {
	test.describe.configure({ timeout: 60_000 });

	test("/en/login: the password field is found by its English label and signs in", async ({
		page,
	}) => {
		await page.goto("/en/login");
		await signInByLabels(page, en);
		await expect(page).toHaveURL(/\/en\/inbox/, { timeout: 30_000 });
	});
});
