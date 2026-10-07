import { expect, test } from "./support/fixtures";
import { LoginPage } from "./support/login-page";

// rule: docs/adr/0010-office-assignment.md (sign-up closed); PRODUCT.md (English and Vietnamese only)
test.describe("ADR 0010 / PRODUCT.md — login offers sign-in only, in EN and VI", () => {
	// rule: docs/adr/0010-office-assignment.md "Public sign-up is closed: an account exists
	// because it was invited into an office." Also AGENTS.md: password login for the seed logins,
	// and ADR 0013: a login can reset its password.
	test(
		"ADR 0010 — offers signing in, never creating an account",
		{ tag: "@core" },
		async ({ page }) => {
			const login = new LoginPage(page);
			await login.goto("en");

			await expect(login.email).toBeVisible();
			await login.switchMode("password");
			await expect(login.password).toBeVisible();
			await expect(login.submit).toHaveText("Sign in");
			await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();

			// Public sign-up is closed: nothing on the page leads to creating an account.
			await expect(
				page.getByRole("link", { name: /create an account|sign up|register/i }),
			).toHaveCount(0);
			await expect(page.getByText(/don't have an account/i)).toHaveCount(0);
		},
	);

	// rule: AGENTS.md password login; docs/e2e-scenarios.md Auth 3 names the magic link as a way
	// to sign in (for an existing account only).
	test("password and magic link are both ways to sign in", async ({ page }) => {
		const login = new LoginPage(page);
		await login.goto("en");

		await login.switchMode("password");
		await expect(login.submit).toHaveText("Sign in");
		await expect(login.password).toBeVisible();

		await login.switchMode("magic-link");
		await expect(login.submit).toHaveText("Send magic link");
		await expect(login.password).toBeHidden();

		await login.switchMode("password");
		await expect(login.submit).toHaveText("Sign in");
		await expect(login.password).toBeVisible();
	});

	// rule: PRODUCT.md "English and Vietnamese only."
	test("language switcher offers only English and Vietnamese", async ({ page }) => {
		await page.goto("/en/login");

		await page.getByRole("button", { name: "Language" }).click();

		const vietnamese = page.getByRole("menuitemradio", { name: "Tiếng Việt" });
		await expect(page.getByRole("menuitemradio", { name: "English" })).toBeVisible();
		await expect(vietnamese).toBeVisible();
		// Both named options are there; nothing else is (no Deutsch, Español, Français…).
		await expect(page.getByRole("menuitemradio")).toHaveCount(2);

		await vietnamese.click();
		await expect(page).toHaveURL(/\/vi\/login/);
	});
});
