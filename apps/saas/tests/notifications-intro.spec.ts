import { expect, test } from "./support/fixtures";
import { AGENT } from "./support/seed";
import { signInContext } from "./support/session-state";

/**
 * Settings → Notifications' heading and its intro line (docs/e2e-scenarios.md Alerts 13, #212).
 * The Vietnamese line is the translation-key test's (modules/i18n/lib/translation-keys.test.ts).
 */
const INTRO = { heading: "Notifications", intro: "Choose what reaches you in Nhịp." } as const;

/** The kit's intro line, which Nhịp's replaces. */
const KIT_INTRO =
	"Choose how you receive notifications. Disabled options are stored; everything is enabled by default.";

// scenario: docs/e2e-scenarios.md Alerts 13
test.describe("Alerts 13 — Settings → Notifications says what it is for", () => {
	test(`(en) the walk office's agent: under the Notifications heading the intro reads "${INTRO.intro}", and the kit's sentence is nowhere on the page`, async ({
		page,
		context,
	}) => {
		await signInContext(context, AGENT);
		await page.goto("/en/settings/notifications");
		const main = page.getByRole("main");
		await expect(main.getByRole("heading", { name: INTRO.heading, exact: true })).toBeVisible();

		// The heading, then its intro line.
		await expect
			.soft(main, "the intro line follows the heading")
			.toMatchAriaSnapshot(
				`- heading ${JSON.stringify(INTRO.heading)}\n- paragraph: ${JSON.stringify(INTRO.intro)}`,
			);
		await expect
			.soft(page.getByText(INTRO.intro, { exact: true }), "the intro line, once")
			.toHaveCount(1);
		await expect.soft(page.getByText(KIT_INTRO), "the kit's sentence is gone").toHaveCount(0);
	});
});
