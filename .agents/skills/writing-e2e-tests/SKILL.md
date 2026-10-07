---
name: writing-e2e-tests
description: "Use when adding Playwright coverage for a user-visible Nhịp workflow (SaaS or marketing) — anything a person does: an agent, manager or platform admin clicking, linking, approving, configuring."
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
- `playwright.config.ts` (per app) is authoritative: Chromium; SaaS on `https://localhost:3443` (a local HTTPS proxy in front of the build on `:3000`),
  marketing on `3001`; the `webServer` block always builds and starts production mode fresh
  (a reused server silently tests stale code; use `E2E_BASE_URL` to target a running one, or
  `E2E_REUSE=1` for the build `scripts/e2e-server.sh` started, below). No retries anywhere: a flaky spec is fixed, not retried.
- Routes are locale-prefixed: navigate to `/en/…` or `/vi/…`; bare paths redirect.
- Locators: `getByRole`, `getByLabel`, `getByText` for what users read; a `data-test`
  attribute only when nothing user-facing is stable (add it to the component deliberately).
  Never CSS structure, never nth-child.
- Waiting: web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL`,
  `toHaveText`). No `waitForTimeout`, no `networkidle`.
- The E2E build polls the Inbox every second, not ten (#222). A change a page learns of shows
  within a second or two; keep a ceiling of three production polls (30 s) for CI's margin. A
  plain assertion can't tell an operator's own action showing at once from the next poll: to
  prove "at once", hold `GET /api/conversations` with `page.route` while asserting.

## Running

- Default: `pnpm --filter saas exec playwright test` builds production on `:3000` with
  `.env.e2e` and its own `supastarter_e2e` database, pushed and seeded fresh. Use it for CI and
  the before-merge `--repeat-each=3` check. If port 3000 is taken, set `E2E_PORT` (e.g. `E2E_PORT=3100`); the
  app URL follows it.
- Many spec files, one build (#205): the default mode builds afresh for every run, so don't pay
  for it once per file.
  1. `scripts/e2e-server.sh` (with the same `E2E_PORT`) builds and starts the E2E server in the
     background: the default mode's chain, env, database and HTTPS proxy.
  2. From `apps/saas`, run each file against it:
     `E2E_REUSE=1 pnpm exec playwright test <file> --workers=1`.
  3. After an app change, it refuses with "app code changed since the build: rerun
     scripts/e2e-server.sh": rerun it. A change under `tests/` alone (a spec, a support helper)
     runs as is.
  4. `scripts/e2e-server.sh --status` says whether it is up and current;
     `scripts/e2e-server.sh --stop` when you're done.

  The database is seeded once per build, as in one CI run, so specs that pass in CI pass here.
- Shared setup lives in `apps/saas/tests/support/`: `fixtures.ts` (`test`, `expect`, the
  `admin` fixture: create offices, invite, clean up), `session-state.ts` (`signInContext`), `login-page.ts` (`LoginPage`), `session.ts`, `invitee.ts`,
  `offices.ts`, `operators.ts` (`joinOffice`), `data.ts` (`uniqueEmail`), `seed.ts` (seed
  logins), `copy.ts` (UI copy per locale). Import from there; don't redefine sign-in or
  invitation helpers in a spec.
- An agent or manager of an office of the test's own is setup: `joinOffice(admin, browser,
  officeId, "member" | "admin", tag)` (`support/operators.ts`, #186). It invites them through the
  API, gives them a signed-up account and a minted session without the sign-up page, accepts the
  invitation through the kit's API and opens their Inbox. Their password is `NEW_PASSWORD`, for a
  spec that signs them in elsewhere. Sign up through the invitation page (`invitee.ts`) only
  where signing up or joining is what the spec proves (the Auth specs, Team).
- The support helpers that touch the database directly (`pipes.ts`, `alerts.ts`, `crm.ts`,
  `deletion.ts`, and `joinOffice`'s account) are async: `await` every call, setup and cleanup
  included. They go through one long-lived tsx process per worker (`state-client.ts`,
  `state-process.ts`, #203), and each read (`alertState`, `mockCrmLeads`,
  `guestDeletionRecords`) is a fresh query. A new one is a command in `state-process.ts`,
  never a `pnpm exec tsx` spawn per call (about 2 s each on CI). A read is fast now, so an
  absence check waits for something that settles first (a later guest's alert or lead), never
  on the read being slow.
- Locate flow elements with `getByTestId` (`data-test`, set in the config). Use roles and
  labels only where the text or accessibility is what the test proves.
- While writing a spec: `E2E_BASE_URL=http://localhost:3010 pnpm --filter saas exec playwright
test <file>` against your running dev server (no build).
- The app is served over HTTPS (self-signed; `ignoreHTTPSErrors` is on), so cookies are
  secure and the base URL is https. Never special-case http in a spec.
- The staging smoke (`tests/smoke/`, `playwright.smoke.config.ts`) is read-only against a
  deployment: no sessions, no writes, few requests.
- Database: local Postgres (brew `postgresql@16`), schema via
  `pnpm --filter @repo/database push`, demo data via `pnpm seed --reset` (walk office, four
  demo threads). Specs must not depend on each other or on order.
- Logins come from the seed (`apps/saas/modules/inbox/lib/walk-user.ts`): the agent
  `walk@nhip.local` and the platform admin `admin@nhip.local`, password `walkthrough`.
- Starting signed in is setup: `signInContext(context, AGENT)` (`support/session-state.ts`),
  the `admin` fixture, or `apiAs(AGENT)`. They use sessions minted before the run
  (`tests/sessions.setup.ts`), never the sign-in endpoint. Drive the login page only when
  signing in is what the spec proves. `test-auth.ts` and `sessions.setup.ts` are not yours to
  edit; ask the main session if a spec needs another seeded login.
- Import `test` and `expect` from `support/fixtures`, never from `@playwright/test`: the
  fixture gives each test its own client IP, so Better Auth's rate limit (on in E2E, 3
  sign-ins per 10 s per IP) never sees two tests as one person. A spec proving the limit
  itself repeats requests inside one test.
- A pipe connection (ADR 0017) cannot be made through Zalo's consent screen in a test. Set one
  up with `await connectZaloOa(officeId, oaId, "disconnected"?)` and remove it with
  `await releaseZaloOa(oaId)` (`support/pipes.ts`); use a unique OA id per test. A guest message on
  that OA arrives as Zalo sends it: `POST /webhooks/zalo` with a JSON body `{ app_id,
event_name: "user_send_text", timestamp (ms, string), sender: { id: guest }, recipient: { id:
oaId }, message: { text, msg_id } }` and header `X-ZEvent-Signature: mac=<sha256 hex of
app_id + raw body + timestamp + ZALO_OA_SECRET_KEY>` (the E2E env's value).
- A spec that needs its own guest brings it in the way the vendor does, through a signed
  webhook, with a unique guest id (e.g. from `test.info().testId`) so parallel specs never
  share a thread. `/dev/inbound` is off in the E2E production build. A spec that needs many
  guests as setup, and doesn't prove how a message arrives, writes them in bulk instead:
  `await seedZaloGuests(officeId, oaId, guestIds, { fate })` (`support/guests.ts`, #222).
  - Zalo: see above.
  - WhatsApp: connect the E2E number to the office first (`await connectWhatsAppNumber(officeId)` in
    `support/pipes.ts`, the number is the E2E env's `WHATSAPP_PHONE_NUMBER_ID`), then `POST
/webhooks/whatsapp` with `{ entry: [{ changes: [{ value: { metadata: { phone_number_id },
contacts: [{ wa_id: guest, profile: { name } }], messages: [{ from: guest, id, timestamp
(seconds, string), type: "text", text: { body } }] } }] }] }` and header
    `X-Hub-Signature-256: sha256=<HMAC-SHA256 hex of the raw body with WHATSAPP_APP_SECRET>`.
    Sends stay mock (the E2E env is `SEND_MODE=mock`).

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
