import { expect, test } from "@playwright/test";

test.describe("home page", () => {
	test("should load", async ({ page }) => {
		await page.goto("/");

		await expect(
			page.getByRole("heading", {
				name: "Build your SaaS without rebuilding the foundations",
			}),
		).toBeVisible();

		await expect(page.locator('[data-test="navigation"]')).toBeVisible();
		await expect(page.locator('[data-test="color-mode-toggle"]')).toBeVisible();
	});
});
