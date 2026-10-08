## 2026-10-08 (A lean E2E suite on two CI runners)

### Changed

- **CI's E2E run is split over two runners** (#278). Each runner builds the app and runs about half the spec files, split by their measured seconds (`scripts/e2e-shard-lists.mjs`, `apps/saas/tests/e2e-timings.json`), so a red half never hides the other. Chromium's headless shell is cached per Playwright version, and the E2E build skips its own type check (the `ci` job type-checks the same commit).
- **The E2E suite follows lean testing** (#278, AGENTS.md). Variant scenarios are cut or folded into one test per feature, Vietnamese copies of English scenarios are replaced by one translation-key test (`modules/i18n/lib/translation-keys.test.ts`), and guards already proven in Vitest moved there. `docs/e2e-scenarios.md` says what proves each scenario now. Shared fixtures do less per test: the admin's page opens only when used, teardown skips work an office's deletion already does, and each worker's state process starts with the worker.

### Added

- **`pnpm e2e:changed`** (#278): the spec files changed since `origin/main`, run against the build `scripts/e2e-server.sh` started. It is the local check before pushing.
