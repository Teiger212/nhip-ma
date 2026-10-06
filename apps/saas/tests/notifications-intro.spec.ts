import { expect, test } from "./support/fixtures";
import { AGENT } from "./support/seed";
import { signInContext } from "./support/session-state";

/**
 * Settings → Notifications' heading and its intro line (docs/e2e-scenarios.md Alerts 13, #212).
 * The Vietnamese line is a proposal pending a native read (#78).
 */
const INTRO = {
	en: { heading: "Notifications", intro: "Choose what reaches you in Nhịp." },
	vi: { heading: "Thông báo", intro: "Chọn những gì đến với bạn trong Nhịp." },
} as const;

/** The kit's intro line, which Nhịp's replaces. */
const KIT_INTRO = {
	en: "Choose how you receive notifications. Disabled options are stored; everything is enabled by default.",
	vi: "Chọn cách bạn nhận thông báo. Các tùy chọn đã tắt sẽ được lưu lại; mặc định tất cả đều bật.",
} as const;

// scenario: docs/e2e-scenarios.md Alerts 13
test.describe("Alerts 13 — Settings → Notifications says what it is for", () => {
	for (const locale of ["en", "vi"] as const) {
		test(`(${locale}) under the Notifications heading the intro reads "${INTRO[locale].intro}", and the kit's sentence is nowhere on the page`, async ({
			page,
			context,
		}) => {
			await signInContext(context, AGENT);
			await page.goto(`/${locale}/settings/notifications`);
			const main = page.getByRole("main");
			await expect(
				main.getByRole("heading", { name: INTRO[locale].heading, exact: true }),
			).toBeVisible();

			// The heading, then its intro line.
			await expect
				.soft(main, "the intro line follows the heading")
				.toMatchAriaSnapshot(
					`- heading ${JSON.stringify(INTRO[locale].heading)}\n- paragraph: ${JSON.stringify(INTRO[locale].intro)}`,
				);
			await expect
				.soft(page.getByText(INTRO[locale].intro, { exact: true }), "the intro line, once")
				.toHaveCount(1);
			await expect
				.soft(page.getByText(KIT_INTRO[locale]), "the kit's sentence is gone")
				.toHaveCount(0);
		});
	}
});
