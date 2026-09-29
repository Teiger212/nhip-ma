import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * Two ways to run (AGENTS.md, "Test quality"):
 * - Default (CI and before merge): a production build on :3000 with `.env.e2e`, against its
 *   own `supastarter_e2e` database, pushed and seeded fresh.
 * - `E2E_BASE_URL=http://localhost:3010`: fast iteration against a running dev server; no
 *   build. The final `--repeat-each=3` check still runs the default way.
 */
const devServer = process.env.E2E_BASE_URL;
/** Port for the production build (default 3000, as in CI); set E2E_PORT when 3000 is taken. */
const e2ePort = Number(process.env.E2E_PORT ?? 3000);
/** The app is reached over HTTPS, as when hosted: a local proxy in front of the build. */
const httpsPort = Number(process.env.E2E_HTTPS_PORT ?? e2ePort + 443);
const e2eUrl = `https://localhost:${httpsPort}`;
// The test-only auth instance (tests/support/test-auth.ts) mints sessions for the server under
// test, so the runner needs that server's database, secret and URL: dev's for a dev server.
if (devServer) {
	dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), quiet: true });
} else {
	dotenv.config({ path: path.resolve(__dirname, "../../.env.e2e") });
	// The app's own URL is baked into the build: the HTTPS address, whatever the ports.
	process.env.NEXT_PUBLIC_SAAS_URL = e2eUrl;
	// Same server and credentials as dev, its own database: like the unit-test database, the
	// E2E one is dev's DATABASE_URL renamed. CI sets DATABASE_URL itself and skips this.
	if (!process.env.DATABASE_URL) {
		const local = path.resolve(__dirname, "../../.env.local");
		const devUrl = fs.existsSync(local)
			? dotenv.parse(fs.readFileSync(local)).DATABASE_URL
			: undefined;
		if (devUrl) {
			const url = new URL(devUrl);
			url.pathname = "/supastarter_e2e";
			process.env.DATABASE_URL = url.toString();
		}
	}
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: "./tests",
	// The staging smoke run has its own config (playwright.smoke.config.ts).
	testIgnore: "smoke/**",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// No retries: a flaky spec is fixed, not retried (AGENTS.md, "Test quality").
	retries: 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["html"]],
	use: {
		// The kit already uses `data-test`; getByTestId follows it.
		testIdAttribute: "data-test",
		// The E2E proxy's certificate is self-signed and made at start.
		ignoreHTTPSErrors: true,
		baseURL: devServer ?? e2eUrl,
		trace: "retain-on-failure",
		video: {
			mode: "retain-on-failure",
			size: { width: 640, height: 480 },
		},
	},
	projects: [
		{ name: "setup", testMatch: /.*\.setup\.ts/ },
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
			dependencies: ["setup"],
		},
	],
	webServer: devServer
		? undefined
		: [
				{
					command: [
						"pnpm --filter saas exec tsx tests/support/ensure-e2e-db.ts",
						"pnpm --filter @repo/database push",
						"pnpm --filter saas seed -- --reset",
						"pnpm --filter saas run build",
						"pnpm --filter saas run start",
					].join(" && "),
					url: `http://localhost:${e2ePort}/api/auth/ok`,
					env: { E2E: "1", PORT: String(e2ePort) },
					// Always a fresh build: a reused server silently tests stale code. Use
					// E2E_BASE_URL to run against a server you already have.
					reuseExistingServer: false,
					stdout: "pipe",
					timeout: 300 * 1000,
				},
				{
					command: `node tests/support/https-proxy.mjs ${httpsPort} ${e2ePort}`,
					url: `${e2eUrl}/api/auth/ok`,
					ignoreHTTPSErrors: true,
					reuseExistingServer: false,
					timeout: 30 * 1000,
				},
			],
});
