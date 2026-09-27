import { expect, test } from "@playwright/test";

// The password input has no accessible name (its "Password" label is not associated), so it is
// found by its semantic autocomplete attribute.
const PASSWORD_INPUT = 'input[autocomplete="current-password"]';

// rule: docs/adr/0010-office-assignment.md (sign-up closed); PRODUCT.md (English and Vietnamese only)
test.describe("ADR 0010 / PRODUCT.md — login offers sign-in only, in EN and VI", () => {
	// rule: docs/adr/0010-office-assignment.md "Public sign-up is closed: an account exists
	// because it was invited into an office." Also AGENTS.md: password login for the seed logins,
	// and ADR 0013: a login can reset its password.
	test("ADR 0010 — offers signing in, never creating an account", async ({ page }) => {
		await page.goto("/en/login");

		await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
		await page.getByRole("tab", { name: "Password" }).click();
		await expect(page.locator(PASSWORD_INPUT)).toBeVisible();
		await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();

		// Public sign-up is closed: nothing on the page leads to creating an account.
		await expect(
			page.getByRole("link", { name: /create an account|sign up|register/i }),
		).toHaveCount(0);
		await expect(page.getByText(/don't have an account/i)).toHaveCount(0);
	});

	// rule: AGENTS.md password login; docs/e2e-scenarios.md Auth 3 names the magic link as a way
	// to sign in (for an existing account only).
	test("password and magic link are both ways to sign in", async ({ page }) => {
		await page.goto("/en/login");

		const passwordInput = page.locator(PASSWORD_INPUT);

		await page.getByRole("tab", { name: "Password" }).click();
		await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
		await expect(passwordInput).toBeVisible();

		await page.getByRole("tab", { name: "Magic link" }).click();
		await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();
		await expect(passwordInput).toBeHidden();

		await page.getByRole("tab", { name: "Password" }).click();
		await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
		await expect(passwordInput).toBeVisible();
	});

	// rule: PRODUCT.md "English and Vietnamese only."
	test("language switcher offers only English and Vietnamese", async ({ page }) => {
		await page.goto("/en/login");

		await page.getByRole("button", { name: "Language" }).click();

		await expect(page.getByRole("menuitemradio", { name: "English" })).toBeVisible();
		await expect(page.getByRole("menuitemradio", { name: "Tiếng Việt" })).toBeVisible();
		await expect(page.getByRole("menuitemradio", { name: "Deutsch" })).toHaveCount(0);
		await expect(page.getByRole("menuitemradio", { name: "Español" })).toHaveCount(0);
		await expect(page.getByRole("menuitemradio", { name: "Français" })).toHaveCount(0);

		await page.getByRole("menuitemradio", { name: "Tiếng Việt" }).click();
		await expect(page).toHaveURL(/\/vi\/login/);
	});
});
