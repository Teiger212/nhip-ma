import type { Browser } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import type { Login } from "./support/seed";
import { AGENT, MANAGER } from "./support/seed";
import { clientIpHeaders } from "./support/session";
import { signInContext } from "./support/session-state";

/** The walk office's settings pages, by address (the walk office's slug is `walk`). */
const OFFICE_SETTINGS = ["/en/walk/settings/general", "/en/walk/settings/billing"];

/** The app's not-found page. */
const NOT_FOUND = "Page not found";

/** `who`, signed in, in a browser of their own. */
async function signedIn(browser: Browser, who: Login) {
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(who.email) });
	await signInContext(context, who);
	return { context, page: await context.newPage() };
}

// scenario: docs/e2e-scenarios.md Team 8
test.describe("Team 8 — office settings are a manager's", () => {
	test("an agent opening the office's settings (General, Billing) by address gets the not-found page (404), with nothing of the settings on it; the manager gets the page", async ({
		browser,
	}) => {
		const agent = await signedIn(browser, AGENT);
		const manager = await signedIn(browser, MANAGER);
		try {
			for (const address of OFFICE_SETTINGS) {
				// The agent: not found.
				const refused = await agent.page.goto(address);
				expect.soft(refused?.status(), `${address} answers 404 for an agent`).toBe(404);
				await expect
					.soft(agent.page.getByText(NOT_FOUND), `the agent sees the not-found page at ${address}`)
					.toBeVisible();
				await expect
					.soft(agent.page.getByRole("textbox"), `no settings field on the agent's ${address}`)
					.toHaveCount(0);

				// The manager: the page.
				const opened = await manager.page.goto(address);
				expect(opened?.status(), `${address} opens for the manager`).toBeLessThan(400);
				await expect(
					manager.page.getByRole("main").getByRole("heading").first(),
					`the manager's ${address} has its heading`,
				).toBeVisible();
				await expect(
					manager.page.getByText(NOT_FOUND),
					`no not-found page at ${address}`,
				).toHaveCount(0);
			}
		} finally {
			await agent.context.close();
			await manager.context.close();
		}
	});
});
