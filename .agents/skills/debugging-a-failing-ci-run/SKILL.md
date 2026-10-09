---
name: debugging-a-failing-ci-run
description: Use when triaging or fixing a failed GitHub Actions validation job for a pull request.
---

# Debug a failing CI run

## Scope

Use for failures in `.github/workflows/ci.yml` (and `format.yml`, which runs `pnpm format:check`). Do not change tests, workflow gates, or production behavior merely to hide an unrelated infrastructure failure.

## Procedure

1. Capture the failing run, job, commit SHA, and first actionable error:
   ```bash
   gh pr checks <pr-number>
   gh run view <run-id>
   gh run view <run-id> --log-failed
   ```
2. Confirm the failure belongs to the current commit and classify it by job and step: `ci` (lint, type-check, `pnpm test`, `migrate:check`, migration lint, `seed:check`) or one of the two `e2e` shards.
3. Reproduce the failed workflow step from a clean install when dependency/cache state is suspect:
   ```bash
   pnpm install
   pnpm --filter @repo/database generate
   pnpm lint
   pnpm format:check
   pnpm type-check
   pnpm test
   pnpm --filter @repo/database migrate:check
   pnpm --filter saas seed:check
   ```
   Run only the commands for the failed step after installation. For an E2E failure, run the failing spec file against the build-once server (`apps/saas/tests/AGENTS.md`, "How E2E runs"), not the whole suite.
4. Match CI environment requirements: `DATABASE_URL`, a test `BETTER_AUTH_SECRET`, and `RESEND_API_KEY` are workflow env values. Do not print secret values.
5. Reduce the reproduction to the failing file or test, then trace the earliest application error rather than later cascade errors or artifact-upload noise.
6. Fix the root cause and add or update a regression test when the failure exposed missing coverage.
7. Re-run the exact failed command, then `pnpm format`, `pnpm lint`, `pnpm type-check`, and relevant tests.

## Canonical reference

`.github/workflows/ci.yml` is authoritative for Node setup, package filters, step order and the timeouts (20 minutes for `ci`, 30 for each E2E shard). Each e2e shard uploads a `playwright-report-<n>` artifact on every run that isn't cancelled: the html report (`playwright-report/`) and every test's duration (`test-results/results.json`), both from `apps/saas/`.

## Done

Document the failing job and error, root cause, changed files, and successful local reproduction of the workflow command.

## Common mistakes

- Debugging the latest run without checking its SHA.
- Fixing a secondary timeout while ignoring an earlier server build error.
- Logging or copying secret values into an issue or test fixture.
- Looking for a marketing report in CI artifacts; the current upload step includes only SaaS.
