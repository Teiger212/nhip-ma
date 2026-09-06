import { expect, test } from "@playwright/test";

test.describe("inbox walk entry", () => {
	test("unauthenticated inbox sends the operator to kit login", async ({ page }) => {
		await page.goto("/inbox");
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
	});

	test("root redirects toward the inbox walk", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
	});
});
