import path from "node:path";

import { defineConfig } from "vitest/config";

const EXCLUDE = ["**/node_modules/**", "**/tests/**", "**/.next/**"];
/** Tests that use the test database (through `test-store`) are named `*.db.test.ts`. */
const DB_TESTS = "**/*.db.test.{ts,tsx}";
const NO_DATABASE = "postgresql://unit-tests-have-no-database@localhost:1/none";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// Spies, stubbed globals and stubbed env vars are undone before every test (#223).
		restoreMocks: true,
		unstubGlobals: true,
		unstubEnvs: true,
		exclude: EXCLUDE,
		// The store hashes vendor message ids under a key from this secret (#141); tests bring
		// their own, so they never need (or read) a real one.
		env: { BETTER_AUTH_SECRET: "vitest-only-not-a-secret-0123456789abcdef-nhip" },
		projects: [
			{
				// Everything that never touches a database: files run in parallel. Both database
				// URLs point at a closed port, so a database file misnamed into this project fails
				// loudly instead of racing the db project, or the dev database, for rows.
				extends: true,
				test: {
					name: "unit",
					exclude: [...EXCLUDE, DB_TESTS],
					env: { DATABASE_URL: NO_DATABASE, TEST_DATABASE_URL: `${NO_DATABASE}_test` },
				},
			},
			{
				// The `*.db.test.ts` files share one test database and empty it before every test,
				// so they run one file at a time, after the unit files.
				extends: true,
				test: {
					name: "db",
					include: [DB_TESTS],
					globalSetup: ["./vitest.global-setup.ts"],
					env: { NHIP_DB_TESTS: "1" },
					fileParallelism: false,
				},
			},
		],
	},
	resolve: {
		alias: {
			"@config": path.resolve(import.meta.dirname, "./config"),
			"@shared": path.resolve(import.meta.dirname, "./modules/shared"),
			"@auth": path.resolve(import.meta.dirname, "./modules/auth"),
			"@organizations": path.resolve(import.meta.dirname, "./modules/organizations"),
			"@payments": path.resolve(import.meta.dirname, "./modules/payments"),
			"@i18n": path.resolve(import.meta.dirname, "./modules/i18n"),
			"@admin": path.resolve(import.meta.dirname, "./modules/admin"),
			"@ai": path.resolve(import.meta.dirname, "./modules/ai"),
			"@onboarding": path.resolve(import.meta.dirname, "./modules/onboarding"),
			"@settings": path.resolve(import.meta.dirname, "./modules/settings"),
			"@inbox": path.resolve(import.meta.dirname, "./modules/inbox"),
			"@home": path.resolve(import.meta.dirname, "./modules/home"),
		},
	},
});
