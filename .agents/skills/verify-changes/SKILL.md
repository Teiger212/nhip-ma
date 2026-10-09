---
name: verify-changes
description: Use when validating a repository change before handoff, commit, or pull-request review.
---

# Verify changes

## Scope

Use for the final repository gates and for selecting focused tests. Do not use this as a substitute for testing the changed behavior while implementing it.

## Procedure

1. Inspect the change and map each touched area to its package:
   ```bash
   git status --short
   git diff --stat
   git diff --check
   ```
2. When proving clean-checkout behavior, use a fresh checkout/worktree and install exactly as CI does before relying on an existing `node_modules` or Turbo cache:
   ```bash
   pnpm install
   ```
   The ignored custom Prisma client under `packages/database/prisma/generated` is absent in a clean checkout. Run `pnpm --filter @repo/database generate` before direct package tests/scripts that load `@repo/database`, after schema changes, and before local E2E. Root `pnpm dev`, `pnpm build`, and `pnpm type-check` already reach the database `generate` task through `turbo.json`; do not add redundant generation to every command.
3. Run focused Vitest tests first, in the owning workspace (for example
   `pnpm --filter @repo/api test`). CI runs root `pnpm test`: Turbo, every workspace with a
   `test` script.
4. When routes, rendering, auth, navigation, forms, or another browser-visible flow changed, run the spec files you touched against the build-once server: `pnpm e2e:changed` from the repo root (`apps/saas/tests/AGENTS.md`, "How E2E runs"). Never the full suite locally; CI's one green run is the gate, and CI runs the SaaS suite only.
   E2E may be skipped for docs-only, server-only, unit-only, or non-behavioral changes when no browser contract is affected; state that reason in the handoff.
5. Run CI-parity read-only gates:
   ```bash
   pnpm lint
   pnpm format:check
   pnpm type-check
   ```
   If they fail, use `pnpm lint:fix` and/or `pnpm format`, review the edits, then rerun the read-only gates.
6. Reinspect `git diff` after any fix command. Confirm no secrets, generated client artifacts, `console.log`, unjustified `any`, or unrelated edits were introduced.
7. Compare failures with `.github/workflows/ci.yml`; its jobs are `ci` (lint, type-check, `pnpm test`, `migrate:check`, migration lint, `seed:check`) and `e2e` (two shards); `format.yml` runs `format:check`. Each e2e shard uploads a `playwright-report-<n>` artifact on every run that isn't cancelled: `apps/saas/playwright-report/` and `apps/saas/test-results/results.json` (every test's duration).

## Canonical reference

`packages/api/modules/organizations/procedures/generate-organization-slug.test.ts` demonstrates focused oRPC testing with Vitest; `apps/saas/tests/login.spec.ts` demonstrates accessible-role Playwright assertions.

## Done

Report every command and exit result, whether clean-checkout installation/generation was exercised, and any justified E2E skip. Verification requires focused tests, `pnpm lint`, `pnpm format:check`, and `pnpm type-check`, plus relevant E2E for changed browser flows.

## Common mistakes and fixes

| Failure                                                   | Cause                                                                                       | Fix                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Missing `packages/database/prisma/generated/client`       | Clean checkout or changed Prisma schema has not generated the ignored client                | Run `pnpm --filter @repo/database generate`; never edit generated client/Zod output  |
| `ERR_PNPM_NO_MATCHING_VERSION` or catalog install refusal | A catalog entry is wrong or the release is younger than `minimumReleaseAge: 1440`           | Correct/reuse `catalog:` or choose an eligible release; do not disable the age guard |
| `pnpm format:check` reports Markdown/TS indentation       | Hand indentation differs from Oxfmt output, including tabs in formatted TypeScript examples | Run `pnpm format`, review the diff, then rerun `pnpm format:check`                   |
| No root `e2e` script or wrong filter                      | E2E is app-local; the root has only `e2e:changed`                                           | Use the commands above, including `@repo/api` and `@repo/database`                   |
