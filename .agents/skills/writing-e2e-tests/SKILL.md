---
name: writing-e2e-tests
description: Use when adding Playwright coverage for a user-visible Nhịp workflow (SaaS or marketing) — anything a person does: an agent, manager or platform admin clicking, linking, approving, configuring.
---

# Write E2E tests (Nhịp)

## The rule this serves

AGENTS.md, "What gets a test" and "Test quality": anything a person does is tested end to end
with Playwright; Vitest covers logic with no user in it (utilities, store queries, queue and
funnel rules, background work). Do not use Playwright for pure functions or single handlers.

## Start from intent, never from the code

1. Every spec starts from a written scenario in `docs/e2e-scenarios.md` or a rule in
   `CONTEXT.md` / `docs/adr/`. If the flow has no scenario yet, write the scenario first, in
   user words, then the spec.
2. Name the source in the spec: `test.describe("CRM 5 — lost leaves the queue, and comes back", …)`
   and a `// scenario: docs/e2e-scenarios.md CRM 5` line above it.
3. Assert what the person sees or what the rule promises: text, roles, where a thread is
   listed, what a count says. Never assert internal calls, database rows the UI never shows,
   or copy that only restates the implementation.
4. Cover the refusal, not only the happy path: the scenario's "fails / is refused / creates
   nothing" lines are tests too.

## Where and how

- Specs live in `apps/saas/tests` or `apps/marketing/tests` as `*.spec.ts` (not `e2e/`).
- `playwright.config.ts` (per app) is authoritative: Chromium; SaaS on `http://localhost:3000`,
  marketing on `3001`; the `webServer` block always builds and starts production mode fresh
  (a reused server silently tests stale code; use `E2E_BASE_URL` to target a running one). No retries anywhere: a flaky spec is fixed, not retried.
- Routes are locale-prefixed: navigate to `/en/…` or `/vi/…`; bare paths redirect.
- Locators: `getByRole`, `getByLabel`, `getByText` for what users read; a `data-test`
  attribute only when nothing user-facing is stable (add it to the component deliberately).
  Never CSS structure, never nth-child.
- Waiting: web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL`,
  `toHaveText`). No `waitForTimeout`, no `networkidle`.

## Running

- Default: `pnpm --filter saas exec playwright test` builds production on `:3000` with
  `.env.e2e` and its own `supastarter_e2e` database, pushed and seeded fresh. Use it for CI and
  the before-merge `--repeat-each=3` check.
- While writing a spec: `E2E_BASE_URL=http://localhost:3010 pnpm --filter saas exec playwright
test <file>` against your running dev server (no build).
- The E2E profile is temporary (AGENTS.md): it moves to a proper HTTPS environment with its
  own Neon branch during milestone 1's staging work.

## Data and sign-in

- Database: local Postgres (brew `postgresql@16`), schema via
  `pnpm --filter @repo/database push`, demo data via `pnpm seed --reset` (walk office, four
  demo threads). Specs must not depend on each other or on order.
- Logins come from the seed (`apps/saas/modules/inbox/lib/walk-user.ts`): the agent
  `walk@nhip.local` and the platform admin `admin@nhip.local`, password `walkthrough`. Sign in
  through the login page as a user would; if many specs need the same session, add a
  `*.setup.ts` with a `storageState` file kept out of Git, and wire the project dependency.
- A spec that needs its own guest creates it with `POST /dev/inbound` (signed in, dev only)
  using a unique guest id, e.g. `e2e-${test.info().testId}`, so parallel specs never share a
  thread.

## Done

- The spec names its scenario or rule.
- It **fails first**: run it against the code with the behaviour missing (or the rule
  broken) and see it red, then green.
- It passes three times in a row headlessly:
  `pnpm --filter saas exec playwright test <file> --repeat-each=3`.
- `pnpm format`, `pnpm lint`, `pnpm type-check` pass.

## Common mistakes

- Writing the spec by reading the component or route code and asserting what it does. Read
  the scenario and the running UI instead; that is what catches a wrong implementation.
- Asserting on copy that is not the point of the test (it breaks on every wording change).
- Sharing seeded threads between specs that change them.
- Starting `pnpm dev` inside a test; Playwright owns the server lifecycle.
- Running a root `pnpm e2e` (it does not exist; use `pnpm --filter saas e2e` or `e2e:ci`).
