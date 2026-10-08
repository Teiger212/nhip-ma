---
name: cutting-a-release
description: Use when releasing Nhịp to production, reading a refused release or a held production deployment, or rolling production back (Vercel instant rollback, Neon restore). Also holds the Vercel project facts (staging, production branch, hosted build).
---

# Cut a release (Nhịp)

The release gate, the production smoke check and rollback. Schema rules (expand/contract) are in
`packages/database/AGENTS.md`.

## Vercel (ADR 0016)

Project `nhip` (team `teiger212s-projects`): root `apps/saas`, build
`turbo run build --filter=saas` (runs `^generate`), Node 22, functions in `sin1`. Staging is
`main`'s deployment at `https://nhip-staging.vercel.app`, with its env vars scoped to Preview
on branch `main`. The production branch is `production`: a GitHub ruleset blocks every push
and deletion, and only the release workflow moves it to a commit staging ran (see "Cutting a
release" below). Vercel builds only `main` (staging) and `production` (Ignored Build Step); PR
previews wait for a database of their own (phase B). Never run `vercel env pull` or
`vercel link` without care: they write `.env.local`.
The repo is not linked; agents read the project with the Vercel CLI by passing
`VERCEL_ORG_ID=team_ADLKpom8d1SF6Gi0X4EaZxlR VERCEL_PROJECT_ID=prj_SLx3Ca2WEF7KpmpHXewJBrwe0rVG`.
Eyal changes project settings in the UI.
Hosted builds run `pnpm run build:vercel` (`apps/saas/scripts/vercel-build.sh`): `prisma migrate
deploy` against `DIRECT_DATABASE_URL` (the environment's direct Neon URL) with a 5s lock timeout,
then the build; a failed migration fails the build and the previous deployment keeps serving.
Rate limits: Better Auth's (sign-in 3/10s per IP, counters in the `rateLimit` table) and a
Firewall rule of 300 requests/min per IP on `/api/` and `/webhooks/`.

## Cutting a release (#112)

Publish a GitHub Release on a commit of `main` that staging deployed and smoked, and that
passed CI on main:
`gh release create vX.Y.Z --target <sha> --generate-notes`.
Always pass `--target`: without it the tag lands on `main`'s HEAD, which may not have finished
on staging yet, and the gate refuses it. The workflow (`.github/workflows/release.yml`) runs
`scripts/release/check-release.sh` on the tag's commit. The gate requires that the commit:

- is on `main`;
- is ahead of `production`;
- has a successful `Preview` deployment;
- has a passing staging smoke run;
- passed CI on main (#190): a successful `ci.yml` run, both its `ci` and `e2e` jobs, from the
  push to main of that very commit. A run still going refuses the release: wait for it to
  pass, then re-run the release. Only the last commit of each push gets a run. On main each
  commit has its own CI concurrency group, so a newer push never cancels it; a run cancelled by
  hand can simply be re-run. Pushes to main run CI even for docs-only changes: `paths-ignore`
  applies to pull requests only. The one exception is a changelog fold commit (#200), which
  github-actions[bot] pushes with `GITHUB_TOKEN` and so starts no CI: with no run of its own,
  it passes on its parent's CI, and the OK line names that parent's run. It counts as a fold
  only when `scripts/release/is-changelog-fold.sh` confirms all of this: one parent; author
  and committer both github-actions[bot]; the fold's subject; and, against its parent, a
  change to `CHANGELOG.md` plus deleted `changelog.d/` fragments and nothing else. The
  parent itself gets no exception, so the exception can't chain.

The workflow waits for Eyal's approval (the `release` environment's required reviewer). It
then fast-forwards `production` with the deploy key, and Vercel builds production from it.

Each release checklist includes one real round trip from a phone over WhatsApp and Zalo, and
alerts on real phones (#135): Android Chrome, and an iPhone from the Home Screen. On each,
tapping an alert opens its thread, the lock screen shows the guest's name, pipe and language
and no message, a burst sounds once, and signing out stops the alerts.

## A production deployment reaches the domain only after its smoke check passes (#113)

Vercel holds each production deployment off the production domain until its Deployment
Checks pass: Vercel's Lint and TypeCheck, and the GitHub check "Production smoke |
production-smoke (nhip - production)". That check is `.github/workflows/production-smoke.yml`,
which runs on Vercel's `vercel.deployment.ready` dispatch. It runs the read-only
`tests/smoke/` suite against the new deployment's own URL and writes nothing. A failing check
keeps the previous deployment on the domain and fails its run. GitHub emails nobody about
that run, since `vercel[bot]` started it: Eyal hears through the release run, which fails
with it. A production deployment outside a release (a Redeploy in Vercel) is only visible
in Actions and in Vercel. The release run waits
until the domain (`vars.PRODUCTION_URL`) serves the new deployment, comparing the `data-dpl-id`
on each page's `<html>`, and then links it in the run summary. If the smoke check fails or
never passes, the release run fails too. **Force Promote** in Vercel skips the checks: use it
only in an emergency, and say so in the release notes. A smoke run that died (cancelled, or a
runner failure) leaves the deployment held: re-run the job. To check a commit beforehand, run
`scripts/release/check-release.sh <sha>`. To go back, use Vercel's instant rollback, never an
older release: the gate refuses one.

## Rolling back after a migration (#98)

Instant rollback is safe only while the older code still works on the new schema, which
expand/contract keeps true. After a release whose migration breaks the code before it (its PR
says so, see "Schema changes are expand/contract" in `packages/database/AGENTS.md`), instant
rollback is unsafe: the old code's writes fail on the new schema. Roll forward with a fix, or
restore the database from a Neon branch. Production's restore window is 6 hours
(`history_retention_seconds` 21600, read from the Neon API on 2026-10-04; the free plan), so a
bad migration noticed the next morning is past it. Before releasing such a migration, branch
`production` from a folder outside the repo, so a restore point outlives the window:
`neon branches create --name pre-vX.Y.Z --parent production --project-id lingering-bonus-85587787`.

## The gate's own tests, and notes

`scripts/release/check-release.test.sh` checks the gate against known commits; it reads GitHub,
so it runs by hand. Its changelog fold cases run offline, on commits it fabricates in a
throwaway repository with a stub `gh`. Notes:

- **A refused release** leaves its tag behind; remove both with
  `gh release delete vX.Y.Z --cleanup-tag`.
- **Commits from before `release.yml` merged** start no run, because GitHub runs the workflow
  from the tagged commit. The first release must target a later commit.
- **The release after an instant rollback** builds, but doesn't take the production domain
  until it's promoted in Vercel (or the rollback is undone). Its release run fails after 30
  minutes, saying the domain doesn't serve it.
- **Until `vars.PRODUCTION_URL` is set**, the release run stops once the smoke check passes,
  and warns that it didn't check the domain.
- **The first production deployment isn't held by the smoke check.** Vercel offers a GitHub
  check only after it has run once, so Eyal requires it after the first release
  (docs/setup-checklist.md); from the second release on, it holds.
- **Release one at a time:** a third release cancels the second while it waits.
