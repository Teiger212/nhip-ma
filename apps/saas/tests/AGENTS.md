# apps/saas/tests (E2E)

How the Playwright suite runs and what its specs may assume. What gets a test, and the
quality bar every test meets, are in the root [AGENTS.md](../../../AGENTS.md) ("What gets a
test"); the spec conventions are the `writing-e2e-tests` skill.

## Where E2E runs

User flows have Playwright specs (`apps/saas/tests`) that CI runs on every PR on the runner (a
production build behind a local HTTPS proxy, its own Postgres 18, mock pipes). After every
staging deploy a read-only Playwright smoke run checks the deployment (`tests/smoke/`).

The root test task runs Vitest in `apps/marketing`, `apps/saas`, and `packages/api`.
Playwright tests are in `apps/marketing/tests` and `apps/saas/tests`. E2E scripts are per app:
use `pnpm --filter marketing e2e`, `pnpm --filter marketing e2e:ci`, `pnpm --filter saas e2e`,
or `pnpm --filter saas e2e:ci`. E2E requires a running application and database.

## Test quality

- Setup is not the flow under test. Seeded logins start signed in from sessions minted once
  per run by Better Auth's `testUtils` in a test-only auth instance
  (`apps/saas/tests/support/test-auth.ts`, run by `tests/sessions.setup.ts`); it never ships
  in the app. Sign in through the login page only where signing in is what the test proves.
  The app's rate limit stays on in E2E: each test is its own client (`clientIpHeaders` in
  `tests/support/session.ts` sets `x-forwarded-for`, which Better Auth keys the limit on).
- The `test-author` agent (`.claude/agents/test-author.md`) can write E2E specs from intent,
  without reading application source (a hook enforces it); using it is optional. The building
  agent may write specs itself, following `writing-e2e-tests`.

## How E2E runs

`pnpm --filter saas exec playwright test` builds production on `:3000` with `.env.e2e` against
its own `supastarter_e2e` database (pushed and seeded fresh), behind a local HTTPS proxy on
`:3443` (`tests/support/https-proxy.mjs`, a throwaway self-signed certificate), so the app runs
with an https URL and secure cookies, with no exception for http. `E2E_PORT` moves both ports
(HTTPS is `E2E_PORT + 443`). Two things differ in the E2E build (`E2E=1`): it logs email
instead of sending it, and the Inbox polls every second instead of every ten
(`NEXT_PUBLIC_E2E`, derived from `E2E` in `next.config.ts`, #222). A Vercel build refuses `E2E`
(`next.config.ts`), and so do production, staging and `SEND_MODE=live` at startup
(`config.ts`). `E2E_BASE_URL=http://localhost:3010` runs against your dev server instead, for
fast iteration.

### Build once, run many spec files (#205)

`scripts/e2e-server.sh` (with `E2E_PORT` if 3000 is taken) runs that same chain and the proxy
in the background, then `E2E_REUSE=1 pnpm --filter saas exec playwright test <file>` runs each
spec file against it, with the default mode's env and no build. It refuses ("app code changed
since the build: rerun scripts/e2e-server.sh") once the app source differs from the build's
(`apps/saas` outside `tests/`, `packages/`, `tooling/`, `.env.e2e`, the lockfile; committed or
not), so rebuild after an app change; a change under `tests/` alone needs none. It also refuses
when the server is down, the env changed, or another build in the worktree replaced `.next`.
The database is seeded once per build, as in one CI run. `--status` says whether it is up and
current; `--stop` stops it when you're done. CI and the default mode still build fresh every
run.

## Smoke

After every staging deploy, `.github/workflows/staging-smoke.yml` runs the read-only staging
smoke (`pnpm --filter saas smoke`, `tests/smoke/`) against the deployment. The same suite gates
production as a Vercel Deployment Check (`.github/workflows/production-smoke.yml`, #113; see
"Cutting a release" in the `cutting-a-release` skill).
