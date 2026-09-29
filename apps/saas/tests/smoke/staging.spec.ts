import type { APIResponse } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { loginCopy } from "../support/copy";
import { LoginPage } from "../support/login-page";

/*
 * Read-only checks against a deployed app (playwright.smoke.config.ts, SMOKE_BASE_URL): nobody
 * signs in, nothing is written, a handful of requests in all. `test` comes from
 * @playwright/test, not support/fixtures: those fixtures mint sessions in a database.
 *
 * A bare status code is not enough against a deployment: Vercel's own walls (Deployment
 * Protection, Firewall challenges) answer 401 and 403 with an HTML page. Each refusal below is
 * also checked to come from the app (its JSON or plain-text answer, not an HTML page).
 */

const en = loginCopy("en");
const vi = loginCopy("vi");

function contentType(res: APIResponse) {
	return res.headers()["content-type"] ?? "";
}

/** The app answered with its API, not with an HTML page from something in front of it. */
function expectJson(res: APIResponse) {
	expect(contentType(res), `${res.url()} content-type`).toContain("application/json");
}

/** The app's plain-text refusal, not an HTML page (a firewall challenge) or no body at all. */
function expectPlainText(res: APIResponse) {
	expect(contentType(res), `${res.url()} content-type`).toContain("text/plain");
}

// scenario: docs/e2e-scenarios.md Staging smoke 1
test.describe("Staging smoke 1 — the app answers", () => {
	test("the login page loads in English with its sign-in button", async ({ page }) => {
		await new LoginPage(page).goto("en");

		await expect(page.getByRole("heading", { name: en.title })).toBeVisible();
		await expect(page.getByRole("button", { name: en.submit, exact: true })).toBeVisible();
	});

	test("the login page loads in Vietnamese with its sign-in button", async ({ page }) => {
		// The copy differs by language; if it did not, this test would prove nothing.
		expect(vi.title).not.toBe(en.title);
		expect(vi.submit).not.toBe(en.submit);

		await new LoginPage(page).goto("vi");

		await expect(page.getByRole("heading", { name: vi.title })).toBeVisible();
		await expect(page.getByRole("button", { name: vi.submit, exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: en.submit, exact: true })).toHaveCount(0);
	});

	test("the auth API says it is up", async ({ request }) => {
		const res = await request.get("/api/auth/ok", { maxRedirects: 0 });

		expect(res.status()).toBe(200);
		expectJson(res);
		expect(await res.json()).toEqual({ ok: true });
	});
});

// scenario: docs/e2e-scenarios.md Staging smoke 2
test.describe("Staging smoke 2 — guests' data stays guarded", () => {
	test("signed out, the inbox's conversations API refuses (401)", async ({ request }) => {
		const res = await request.get("/api/conversations", { maxRedirects: 0 });

		expect(res.status()).toBe(401);
		expectJson(res);
	});

	test("signed out, the pipe status API refuses (401)", async ({ request }) => {
		const res = await request.get("/api/pipes/status", { maxRedirects: 0 });

		expect(res.status()).toBe(401);
		expectJson(res);
	});

	test("signed out, the admin area sends the visitor to login", async ({ page }) => {
		await page.goto("/en/admin/organizations");

		await expect(page).toHaveURL(/\/en\/login(\?|$)/);
		await expect(page.getByRole("button", { name: en.submit, exact: true })).toBeVisible();
	});
});

// scenario: docs/e2e-scenarios.md Staging smoke 3
test.describe("Staging smoke 3 — webhooks fail closed", () => {
	// Well-formed payloads with no signature: the refusal is about the signature, not the body.
	test("an unsigned WhatsApp webhook is refused (403)", async ({ request }) => {
		const res = await request.post("/webhooks/whatsapp", {
			data: { object: "whatsapp_business_account", entry: [] },
			maxRedirects: 0,
		});

		expect(res.status()).toBe(403);
		expectPlainText(res);
	});

	test("an unsigned Zalo webhook is refused (403)", async ({ request }) => {
		const res = await request.post("/webhooks/zalo", {
			data: {
				event_name: "user_send_text",
				app_id: "0",
				sender: { id: "smoke" },
				recipient: { id: "smoke" },
				message: { msg_id: "smoke", text: "smoke" },
				timestamp: "0",
			},
			maxRedirects: 0,
		});

		expect(res.status()).toBe(403);
		expectPlainText(res);
	});
});
