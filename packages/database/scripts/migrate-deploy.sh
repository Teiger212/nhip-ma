#!/usr/bin/env bash
# `prisma migrate deploy` with a lock timeout (#98). A migration that waits on a lock queues every
# request behind it; with lock_timeout it fails fast instead, so the build fails and the previous
# deployment keeps serving. The timeout rides on the connection (Postgres `options`, which Neon's
# direct endpoint accepts), so it covers every statement: Prisma runs a migration statement by
# statement, not in one transaction. No statement_timeout: backfills on big tables must finish.
# Hosted builds run this with the direct URL (apps/saas/scripts/vercel-build.sh). Extra arguments
# go to prisma.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL must be set (hosted: the direct, non-pooled URL)}"

# Keep any options the URL already carries; append ours.
url=$(node -e '
const url = new URL(process.env.DATABASE_URL);
const options = [url.searchParams.get("options"), "-c lock_timeout=5s"].filter(Boolean).join(" ");
url.searchParams.delete("options");
url.search += `${url.search ? "&" : "?"}options=${encodeURIComponent(options)}`;
process.stdout.write(url.toString());
')
DATABASE_URL="$url" exec pnpm exec prisma migrate deploy "$@"
