/**
 * Smoke check for CI: the seed's walk-user step must load under `tsx` without a
 * database. It regressed once when a transitive ESM-only dependency entered the
 * `@repo/auth` import chain (PR #8), which only surfaced on a fresh machine.
 */
import("./seed-walk-user")
	.then(() => {
		console.info("seed-walk-user loads");
	})
	.catch((error: unknown) => {
		console.error("seed-walk-user failed to load", error);
		process.exitCode = 1;
	});
