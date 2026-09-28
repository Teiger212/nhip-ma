import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** The login copy each language ships (packages/i18n/translations/<locale>/saas.json). */
type LoginCopy = {
	title: string;
	submit: string;
	modes: { password: string; magicLink: string };
	password: string;
};

function loginCopy(locale: "en" | "vi"): LoginCopy {
	const file = path.resolve(__dirname, `../../../packages/i18n/translations/${locale}/saas.json`);
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		auth: {
			login: Omit<LoginCopy, "password">;
			signup: { password: string };
		};
	};
	return { ...saas.auth.login, password: saas.auth.signup.password };
}

const en = loginCopy("en");
const vi = loginCopy("vi");

// Seed login (apps/saas/modules/inbox/lib/walk-user.ts).
const AGENT = { email: "walk@nhip.local", password: "walkthrough" };

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
