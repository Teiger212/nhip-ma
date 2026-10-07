import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// Spies, stubbed globals and stubbed env vars are undone before every test (#223).
		restoreMocks: true,
		unstubGlobals: true,
		unstubEnvs: true,
	},
});
