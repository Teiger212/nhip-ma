import { defineConfig } from "vitest/config";

/** The database package's own tests: helpers, the client, the migration scripts. Store tests run in apps/saas. */
export default defineConfig({
	test: {
		environment: "node",
		// Spies, stubbed globals and stubbed env vars are undone before every test (#223).
		restoreMocks: true,
		unstubGlobals: true,
		unstubEnvs: true,
	},
});
