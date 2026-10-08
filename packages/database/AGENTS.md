# packages/database

The schema, migrations, worktree databases and the hosted (Neon) databases. Read this before
changing `prisma/schema.prisma` or writing a migration. Repo-wide rules are in the root
[AGENTS.md](../../AGENTS.md); releasing and rolling back production are in the
`cutting-a-release` skill.

## Data layer

Keep database access in `packages/database`. Prisma owns the whole schema
(`prisma/schema.prisma`): the Better Auth tables and the `inbox_*` tables (ADR 0012). The
inbox store in `packages/database/inbox` is the only writer of the inbox tables, with zod
vocabularies for the open-ended fields. Database package scripts:

```bash
pnpm --filter @repo/database generate
pnpm --filter @repo/database push                 # apply schema.prisma to your dev database
pnpm --filter @repo/database migrate <name>       # write the migration for it (= migrate:new)
pnpm --filter @repo/database studio
```

The kit's `migrate` ran `prisma migrate dev`, which can't work here: every dev, worktree, E2E
and test database is built with `push`, so it stops at "We need to reset" (Prisma 7.9.1 exits
without touching data). It now runs `migrations.sh new`, the kit's name with the kit's intent:
create a migration.

Change the schema in `packages/database/prisma/schema.prisma`, then run the matching
command. Do not hand-edit generated Prisma client output or
`packages/database/prisma/zod/index.ts`.

`BETTER_AUTH_SECRET` also keys the hash vendor message ids are stored as (#141,
`packages/database/inbox/vendor-id.ts`). Rotating it breaks duplicate detection across the
rotation: a vendor retry of a message that arrived before is filed again.

The compose `postgres` service is PostgreSQL 16 on port 5432; compose also defines MinIO
for storage.

## Worktree databases (decided 2026-10-03)

Each worktree has its own databases, so worktrees on different schemas never break each other.
`scripts/worktree-db.sh <worktree>` creates the dev database `nhip_dev_<name>` on local Postgres
(schema pushed, seeded) and writes it into the worktree's `.env.local`, with `TEST_DATABASE_URL`
(`nhip_test_<name>`) and `E2E_DATABASE_URL` (`nhip_e2e_<name>`), which Vitest and Playwright
create themselves. With `--neon` the dev database is a copy-on-write child of the Neon `dev`
branch (`wt-<name>`) instead, for a remote session that cannot reach local Postgres. `--delete`
drops them when the worktree goes. Running a single test file through that env is in
`apps/saas/AGENTS.md` ("Vitest").

## Neon (staging and prod, ADR 0016)

The repo root is linked to Neon project `lingering-bonus-85587787` (`.neon`, git-ignored;
`neon.ts` is the project config). Pass `--no-env-pull` to every `neon link`, `neon deploy` and
`neon checkout`, or the CLI writes the linked branch's `DATABASE_URL` into `.env.local` and
repoints dev without asking.
Neon branches: `production` (default), `staging` (schema from `prisma migrate deploy`,
never seeded: the seed's password is public), and `dev` (a schema-only copy of `staging`,
seeded with the demo logins and threads; nothing real). Each of staging and production gets two
login roles (#98). Migrations run as the owner, `neondb_owner`, over `DIRECT_DATABASE_URL`, with
no statement cap. The app connects through the pooler as `nhip_app` (`DATABASE_URL`), which
reads and writes rows only and carries `statement_timeout` 25s and
`idle_in_transaction_session_timeout` 30s (`packages/database/sql/app-role.sql`, run by Eyal per
docs/setup-checklist.md; until then the app still connects as `neondb_owner`). Server timeouts
never go in the app's pool config: pg sends them as startup parameters, and Neon's pooler
refuses the connection. The pool itself (`packages/database/prisma/client.ts`) gives up a
connection after 10s and is attached to Vercel's Fluid compute (`attachDatabasePool`).

## Migrations (decided 2026-10-04, #95)

Dev databases are built with `db push`; staging and production only ever run
`prisma migrate deploy`. To make a dev database deploy-ready (or to bring one forward with
`migrate deploy` instead of `push`), give it a migration history once:

```bash
pnpm --filter @repo/database migrate:baseline   # marks applied the migrations its schema already has
pnpm --filter @repo/database migrate:deploy     # applies the rest
```

`migrate:baseline` replays `prisma/migrations` one by one into a throwaway database and marks
applied the longest run, from the first, whose schema equals the database's; it refuses a
database no run reproduces, and does nothing on one that already has a history. Write new
migrations with `migrate:new <name>` and read them: Prisma cannot fill a new required column on
a table that has rows, so follow the expand/contract table below (a constant default, or the
two-deploy "Make a column required" row); a plain `SET NOT NULL` fails the migration lint.
The main dev DB was baselined on 2026-10-04.

## Lint and lock timeout (#98)

CI lints the migrations a PR adds with Squawk, never applied ones (`migrate:lint`; the rules,
and why some are off, are in `packages/database/.squawk.toml`). Lint a new one with
`pnpm --filter @repo/database migrate:lint prisma/migrations/<dir>/migration.sql`.
A deliberate exception gets `-- squawk-ignore <rule>` on the line before its statement, with a
comment saying why: a new table's foreign keys (`adding-foreign-key-constraint,
constraint-missing-not-valid`, no rows to scan), or the drop in a contract deploy
(`ban-drop-column`). `migrate:deploy` and hosted builds run `scripts/migrate-deploy.sh`, which
sets `lock_timeout` 5s on the connection: a migration blocked on a lock fails the build instead
of queueing every request behind it.

## A migration that fails

Prisma runs a migration statement by statement, not in one transaction (verified 2026-10-04 on
Prisma 7.9.1), so a failure leaves the statements before it applied. Its failed row in
`_prisma_migrations` makes every later deploy refuse (P3009) until it is resolved, against
`DIRECT_DATABASE_URL` from `packages/database`:

1. See which of its statements applied (the build log names the one that failed).
2. Either undo them and run
   `DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma migrate resolve --rolled-back <name>`,
   so the next deploy runs it again; or apply the rest by hand and resolve it `--applied`.
3. Redeploy. A lock timeout on the migration's first statement applied nothing: resolve it
   `--rolled-back` and redeploy once the lock's holder is gone.

## Schema changes are expand/contract

A deploy runs `migrate deploy` before the new code serves, while the previous deployment still
serves, so every migration must work with the code before it
([ParallelChange](https://martinfowler.com/bliki/ParallelChange.html); Braintree's
[schema changes without downtime](https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680);
GitLab's [avoiding downtime in migrations](https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations)).
There is no post-deploy migration step, so "after the code ships" means a second deploy.

| Change                                    | Deploys | How                                                                                                                                |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| New table, nullable column, index         | 1       | As is                                                                                                                              |
| New column with a constant default        | 1       | `NOT NULL DEFAULT …`: old code omits it, Postgres fills it (no rewrite)                                                            |
| New foreign key or check on existing rows | 1       | Add it `NOT VALID`, then `VALIDATE CONSTRAINT` (no write lock)                                                                     |
| Make a column required (new or existing)  | 2       | Deploy the code that writes it; then backfill, and `SET NOT NULL` (behind a validated `CHECK … IS NOT NULL`, which skips the scan) |
| Rename a column or table, change a type   | 2+      | Add the new one, write both, backfill, read the new one; drop the old one in a later deploy                                        |
| Drop a column or table                    | 2       | Stop reading and writing it; drop it in the next deploy                                                                            |

The deploys can be an hour apart. Every migration PR says which row it is; one that breaks the
code before it says why that is safe (no live writers, or an announced off-hours window) and that
Vercel's instant rollback is then unsafe (old code on the new schema; "Rolling back after a
migration" in the `cutting-a-release` skill). #95 is the recorded exception: its required
`officeId` columns shipped in one deploy, before any office was live.
