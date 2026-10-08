/**
 * Smoke check for CI: the seed's steps must load under `tsx` without a database. It regressed
 * once when a transitive ESM-only dependency entered the `@repo/auth` import chain (PR #8),
 * which only surfaced on a fresh machine. `run-seed` brings in the rich seed's chain too (#69).
 */
Promise.all([import("./seed-demo-user"), import("./run-seed")])
	.then(() => {
		console.info("seed-demo-user loads");
		console.info("run-seed loads");
	})
	.catch((error: unknown) => {
		console.error("the seed failed to load", error);
		process.exitCode = 1;
	});
