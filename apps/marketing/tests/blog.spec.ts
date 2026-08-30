import { expect, test } from "@playwright/test";

test.describe("blog list", () => {
	test("filters posts by the tag query param", async ({ page }) => {
		await page.goto("/blog");

		const workspacePost = page.locator("article").filter({ hasText: "One workspace per client" });
		const billingPost = page
			.locator("article")
			.filter({ hasText: "Plans you can explain without a spreadsheet" });

		await expect(workspacePost).toBeVisible();
		await expect(billingPost).toBeVisible();

		await page
			.locator('[data-test="blog-tag-filter"]')
			.getByRole("link", { name: "billing" })
			.click();

		await expect(page).toHaveURL(/[?&]tag=billing(?:&|$)/);
		await expect(billingPost).toBeVisible();
		await expect(workspacePost).toHaveCount(0);

		await page.locator('[data-test="blog-tag-all"]').click();

		await expect(page).toHaveURL(/\/blog\/?$/);
		await expect(workspacePost).toBeVisible();
	});

	test("shows an empty state for an unknown tag", async ({ page }) => {
		await page.goto("/blog?tag=not-a-real-tag");

		await expect(page.locator('[data-test="blog-empty-filter"]')).toBeVisible();
		await expect(
			page.locator("article").filter({ hasText: "One workspace per client" }),
		).toHaveCount(0);
	});
});
