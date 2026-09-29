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
	echo "Applying migrations (prisma migrate deploy)"
	# The direct (non-pooled) URL: migrations take locks the pooler cannot hold.
	(cd ../../packages/database && DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma migrate deploy)
fi

cd ../.. && pnpm exec turbo run build --filter=saas
