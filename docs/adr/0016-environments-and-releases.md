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

## Amendment (2026-09-28): PR previews

- Each PR gets a Vercel preview on a Neon branch created by CI from `staging`,
  **schema-only** (no staging data), migrated and seeded, and deleted when the PR closes.
  The Neon–Vercel integration is not used: it branches from the default branch, which is
  prod.
- Previews always run `SEND_MODE=mock`, have no pipe connections, and get their own auth
  secret and encryption key.
- Previews sit behind Vercel's protection; CI reaches them with the bypass secret. Only on
  previews, Better Auth keys its rate limit on an `x-e2e-client` header before the real IP,
  so each E2E test is its own client while the limit stays on. Staging and prod never read
  it.
- Staging and prod: one Vercel project. `main` builds staging (env vars scoped to Preview on
  `main`); the `production` branch builds prod, guarded by a ruleset so only the release
  workflow moves it.
