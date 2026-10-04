import { defineConfig } from "vitest/config";

/** The database package's own tests: helpers, the client, the migration scripts. Store tests run in apps/saas. */
export default defineConfig({
	test: {
		environment: "node",
	},
});
