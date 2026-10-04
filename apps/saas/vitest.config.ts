import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: ["**/node_modules/**", "**/tests/**", "**/.next/**"],
		globalSetup: ["./vitest.global-setup.ts"],
		// The store hashes vendor message ids under a key from this secret (#141); tests bring
		// their own, so they never need (or read) a real one.
		env: { BETTER_AUTH_SECRET: "vitest-only-not-a-secret-0123456789abcdef-nhip" },
		// Store tests share one database and truncate it; files must not interleave.
		fileParallelism: false,
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
