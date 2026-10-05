import { defineConfig, devices } from "@playwright/test";

/**
 * The staging smoke run (docs/e2e-scenarios.md, "Staging smoke"): read-only checks against a
 * deployed app, no build and no database. SMOKE_BASE_URL is the deployment to check (the CI
 * workflow passes the one Vercel just built).
 */
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error("Set SMOKE_BASE_URL to the deployment to check");

export default defineConfig({
	testDir: "./tests/smoke",
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL,
		testIdAttribute: "data-test",
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
