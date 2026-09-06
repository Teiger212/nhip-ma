import { expect, test } from "@playwright/test";

test.describe("inbox walk entry", () => {
	test("unauthenticated inbox sends the operator to kit login", async ({ page }) => {
		await page.goto("/inbox");
		await expect(page).toHaveURL(/\/en\/login/);
		await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
	});

	test("locale-prefixed inbox routes keep their prefix on login", async ({ page }) => {
		await page.goto("/en/inbox");
		await expect(page).toHaveURL(/\/en\/login/);
		await page.goto("/vi/inbox");
		await expect(page).toHaveURL(/\/vi\/login/);
	});

	test("root redirects toward the English inbox walk", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/en\/login/);
		await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
	});
});
