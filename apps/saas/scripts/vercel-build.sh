#!/usr/bin/env bash
# Vercel's build for apps/saas (ADR 0016): apply pending migrations to the environment's
# database, then build. A migration that fails fails the build, so new code never goes live
# against an old schema and the previous deployment keeps serving. Migrations stay additive
# and compatible with the release before, so applying one ahead of its code is safe.
set -euo pipefail

if [ -n "${VERCEL:-}" ]; then
	if [ -z "${DIRECT_DATABASE_URL:-}" ]; then
		echo "DIRECT_DATABASE_URL is not set: hosted builds migrate first (ADR 0016)." >&2
		exit 1
	fi
	echo "Applying migrations (prisma migrate deploy, lock_timeout 5s)"
	# The direct (non-pooled) URL: migrations take locks the pooler cannot hold. A migration
	# blocked on a lock fails within 5s instead of queueing every request behind it (#98).
	DATABASE_URL="$DIRECT_DATABASE_URL" ../../packages/database/scripts/migrate-deploy.sh
fi

cd ../.. && pnpm exec turbo run build --filter=saas
