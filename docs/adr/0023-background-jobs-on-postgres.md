# 0023. Background jobs run on Postgres, in a table of our own, woken by `after()` and a cron

Date: 2026-10-06. Status: accepted; built after go-live. Amends ADR 0016's "Background work runs
on Next.js `after()`" and ADR 0019's `after()` and "Needs a scheduler Nhịp does not have";
gives ADR 0014's daily purge its scheduler. Until it is built, `after()` alone stands. Decided in
the grill of 2026-10-06 (Q8, Q10–Q12), #177.

## Context

- **Today every background task runs once, in `after()`** (ADR 0016; `background.ts`). Nothing
  retries, waits or repeats, and a task an instance loses is gone.
- **Work that needs more:**
  - #64: a failed CRM write heals with retries and backoff.
  - #67: the hourly reconcile, a schedule.
  - #131: escalation after N minutes, a delayed job.
  - ADR 0014: a closing office is purged by a daily job, and "Nothing in the stack schedules
    jobs yet".
  - Alert pushes fan out to devices inside the event's own `after()`, at most 5 in flight
    (#134, #135).
- **Postgres, decided (Eyal, 2026-10-05, #177):** no Kafka and no separate queue service.
- **The app's database role.** The app connects as `nhip_app`, which reads and writes rows only,
  with no DDL. It carries `statement_timeout` 25s and `idle_in_transaction_session_timeout` 30s
  (`packages/database/sql/app-role.sql`). Migrations run as the owner role, written with
  `migrate:new`.
- **Neon's pooler.** The app connects through Neon's pooler, PgBouncer in transaction mode. It
  doesn't support `LISTEN`/`NOTIFY` or session-level advisory locks
  (neon.com/docs/connect/connection-pooling, read 2026-10-06). Today's code takes
  transaction-scoped locks (`pg_advisory_xact_lock`), which work.
- **Neon's compute sleeps.**
  - `pg_cron` runs only while the compute is active (neon.com/docs/extensions/pg_cron, read
    2026-10-06).
  - Neon scales a compute to zero after 5 minutes of inactivity, a setting fixed on the Free
    plan (neon.com/docs/introduction/scale-to-zero, read 2026-10-06).
- **Neon's plan (Q9).** The project is on Neon's Free plan and moves to Launch when the first
  client signs (#99). On Free, the project gets 100 CU-hours a month, production included,
  and Neon suspends the compute once they are used up.
- **Vercel has no long-running worker.**
  - Vercel Cron calls the production deployment's URL only (vercel.com/docs/cron-jobs, read
    2026-10-06).
  - Pro allows a cron once a minute (vercel.com/docs/cron-jobs/usage-and-pricing); the team is
    on Pro (docs/setup-checklist.md).
  - Delivery is best effort: a run can be missed or delivered more than once, and a failed run
    is not retried (vercel.com/docs/cron-jobs/manage-cron-jobs, read 2026-10-06).
  - With `CRON_SECRET` set, Vercel sends it as `Authorization: Bearer <secret>` (same page).
  - A function on Fluid compute on Pro runs 300s by default and 800s at most
    (vercel.com/docs/functions/configuring-functions/duration, read 2026-10-06).

## Decision

### Not at go-live (Q8)

The first client goes live on today's try-once `after()` work. There is no job table at go-live.
This ADR, #64 and #67 come after it.

### A table of our own (Q10)

- **The table.** A jobs table of Nhịp's own, created with `migrate:new` like any other table.
  Its columns start from #177's sketch: `kind`, `payload`, `run_at`, `attempts`, `status`,
  `locked_until` and a unique `dedupe_key`.
- **No pg-boss and no graphile-worker.**
  - Both manage their own schema outside Prisma, and `nhip_app` can't run DDL.
  - Both need tuning for serverless and for the transaction pooler.
  - pg-boss is the named fallback if the needs grow.
- **The claim** is one statement:
  `UPDATE … SET locked_until = … WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED LIMIT n)
RETURNING …`. (The grill wrote `id = (SELECT …)`; `IN` is what lets one claim take n jobs.)
- **A lease, not an open transaction, holds a job.**
  - The claim commits at once, with `locked_until` as the lease, because `nhip_app`'s
    transactions end after 30s idle.
  - A job whose lease has passed can be claimed again. That is how a job a dead worker held
    comes back.
- **Time is data.** Retries and backoff are columns. A delay or a schedule is a future `run_at`.

### What wakes the jobs (Q11)

- **An `after()` kick right after enqueue**: the fast path.
- **Vercel Cron every 5 minutes on production**, calling a drain route guarded by `CRON_SECRET`.
  - It is the safety net for retries, delays and the hourly check.
  - It runs every 5 minutes, not every minute, so Neon's compute can scale to zero (Eyal's
    reason, Q11).
- **A GitHub Actions scheduled workflow every 15 minutes** calls staging's drain route, because
  Vercel Cron only calls production.

### The job contract (Q12)

1. **The payload holds opaque ids only,** never guest data.
2. **Every handler is idempotent,** because delivery is at least once.
3. **Attempts.** A job gets up to 5 attempts, with backoff of 1, 5, 15 and 60 minutes.
4. **After the last attempt the job is `dead`.** It is kept 30 days, logged without ids, then
   purged.
5. **A job whose target is gone counts as done, not failed.** For example, a guest deleted
   under ADR 0020.
6. **A unique `dedupe_key`.**
7. **Dead jobs become visible to the platform admin later.** There is no alerting before
   go-live.

## Considered options

- **pg-boss or graphile-worker.** Postgres-native and proven, but they own their schema outside
  Prisma, need DDL that `nhip_app` doesn't have, and need tuning for serverless and the
  transaction pooler. pg-boss is the fallback.
- **Kafka or a separate queue service.** Ruled out (Eyal, 2026-10-05, #177).
- **`LISTEN`/`NOTIFY` as the wake-up.** Neon's pooler doesn't support it.
- **`pg_cron` on Neon.** It runs only while the compute is awake.
- **Vercel Cron every minute.** Pro allows it, but every 5 minutes leaves Neon's compute room to
  scale to zero.

## Consequences

- **Re-specced on it after go-live:**
  - #64: CRM write retries;
  - #67: the hourly reconcile, as a schedule.
- **Built on it:**
  - #131's escalation is a delayed job.
  - ADR 0014's daily purge runs on it.
  - Push fan-out can move onto it later.
- **Not a job:** #144's realtime inbox is pub/sub.
- **New pieces when it is built:**
  - one additive table;
  - a drain route;
  - a cron entry on production;
  - a scheduled GitHub Actions workflow for staging;
  - `CRON_SECRET` on production and staging, and as a GitHub Actions secret for the staging
    workflow.
- **The drain must fit a function's time:** 300s by default on Fluid compute, 800s at most.
- **What it changes in earlier ADRs:**
  - ADR 0016: `after()` is no longer the only background work; it becomes the fast path.
  - ADR 0019: the alert's `after()` stays until fan-out moves. "Alert the owner, then managers
    after N minutes" no longer lacks a scheduler.
  - ADR 0014: the daily purge has its scheduler.
