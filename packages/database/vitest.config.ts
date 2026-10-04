import { defineConfig } from "vitest/config";

/** Unit tests of the database package's pure helpers; store tests run in apps/saas. */
export default defineConfig({
	test: {
		environment: "node",
		include: ["inbox/**/*.test.ts"],
	},
});
