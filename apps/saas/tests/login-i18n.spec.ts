import type { Page } from "@playwright/test";

import type { LoginCopy } from "./support/copy";
import { loginCopy } from "./support/copy";
import { expect, test } from "./support/fixtures";
import { AGENT } from "./support/seed";

const en = loginCopy("en");
const vi = loginCopy("vi");

/** Signs in by what each field says, in the page's language: the labels are the point here. */
async function signInByLabels(page: Page, copy: LoginCopy) {
	await page.getByRole("tab", { name: copy.modes.password }).click();
	await page.getByLabel("Email", { exact: true }).fill(AGENT.email);
	await page.getByLabel(copy.password, { exact: true }).fill(AGENT.password);
	await page.getByRole("button", { name: copy.submit, exact: true }).click();
}

// rule: PRODUCT.md "English and Vietnamese only."
test.describe("PRODUCT.md English and Vietnamese only — the login page speaks both", () => {
	test.describe.configure({ timeout: 60_000 });

	test("/vi/login is in Vietnamese: heading, tabs and sign-in button", async ({ page }) => {
		// The copy differs by language; if it did not, this test would prove nothing.
		expect(vi.title).not.toBe(en.title);
		expect(vi.submit).not.toBe(en.submit);

		await page.goto("/vi/login");

		await expect(page.getByRole("heading", { name: vi.title })).toBeVisible();
		await expect(page.getByRole("tab", { name: vi.modes.password })).toBeVisible();
		await expect(page.getByRole("tab", { name: vi.modes.magicLink })).toBeVisible();
		await expect(page.getByRole("button", { name: vi.submit, exact: true })).toBeVisible();

		await expect(page.getByRole("heading", { name: en.title })).toHaveCount(0);
		await expect(page.getByRole("button", { name: en.submit, exact: true })).toHaveCount(0);
	});

	test("/vi/login: the password field is found by its Vietnamese label and signs in", async ({
		page,
	}) => {
		await page.goto("/vi/login");
		await signInByLabels(page, vi);
		await expect(page).toHaveURL(/\/vi\/inbox/, { timeout: 30_000 });
	});

	test("/en/login: the password field is found by its English label and signs in", async ({
		page,
	}) => {
		await page.goto("/en/login");
		await signInByLabels(page, en);
		await expect(page).toHaveURL(/\/en\/inbox/, { timeout: 30_000 });
	});
});
