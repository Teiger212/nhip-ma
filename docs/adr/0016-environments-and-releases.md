# 0016. Dev is local; staging and prod run on Vercel and Neon in Singapore; prod ships by release

Date: 2026-09-27. Status: accepted.

## Context

The advanced MVP needs a staging environment where Eyal dogfoods every feature end to end on
real WhatsApp and Zalo pipes, and a production environment for beta agencies. The kit
(supastarter) is built for Vercel. The database is small. A Meta app and a Zalo OA each have
one webhook URL, so a real pipe can feed exactly one environment.

## Decision

- **Three environments.** Dev is each developer's machine: native Postgres, seed data, mock
  sends, fake guests through `/dev/inbound`. Staging and prod are hosted. Staging uses real
  pipes with test identities (a Meta test number, a test Zalo OA, Eyal's phone as the
  guest) and `SEND_MODE=live`. Prod uses each agency's own numbers.
- **Vercel for the app, Neon for Postgres, both in Singapore** (`sin1`, `ap-southeast-1`),
  on free tiers until beta agencies are live. Background work runs on Next.js `after()`,
  which the platform keeps alive after the response.
- **main is staging.** Every merge deploys to staging after CI passes: lint, format, types,
  Vitest, and Playwright against a throwaway Neon branch with mock pipes.
- **Prod ships by GitHub Release.** CI refuses a release whose commit did not run on staging,
  runs prod migrations, then deploys that commit. Rollback is Vercel's instant rollback;
  migrations stay backward-compatible for one release.
- **Schema changes go through `prisma migrate`** on hosted environments, from a baseline
  taken before staging goes live. `db push` stays a dev convenience.

## Considered options

- **Promote the staging build to prod** instead of releases: less ceremony, but no version
  record, and `NEXT_PUBLIC_*` values force a rebuild anyway, so it is not the same artifact.
- **Self-hosted VPS** for app and database: no extra cost and fits long-lived background
  work, but backups, patching, TLS and uptime become ours, and it is a single point of failure
  for guests' personal data.
- **Supabase / Prisma Postgres**: Supabase's free projects pause after a week idle; both are
  fine at this size, but Neon's branches give CI and staging their own databases.

## Consequences

- A second set of WhatsApp/Zalo test apps is needed for staging; prod gets its own.
- Model calls, not hosting, are the expected cost driver.

## Amendment (2026-09-28, revised 2026-09-29): E2E over HTTPS in CI, a smoke run on staging

- **No per-PR previews for now.** Vercel's protection covers every deployment except
  production, and staging (a `main` preview) is public, so previews could not be protected
  without locking staging. Instead, CI's E2E runs the production build behind a local HTTPS
  proxy (a throwaway self-signed certificate): the app runs with an https URL and secure
  cookies, and the app carries no E2E exception. Rate limits stay on; each test is its own
  client by `x-forwarded-for`.
- **After every staging deploy, a read-only smoke run** checks the deployed app (pages load,
  signed-out APIs refuse, webhooks fail closed), which covers what only the platform shows.
- Per-PR previews on Neon branches stay an option if staging keeps finding problems late.
- Staging and prod: one Vercel project. `main` builds staging (env vars scoped to Preview on
  `main`); the `production` branch builds prod, guarded by a ruleset so only the release
  workflow moves it.
