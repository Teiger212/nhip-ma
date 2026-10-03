#!/usr/bin/env bash
# A worktree's own dev database: a copy-on-write child of the Neon `dev` branch (schema and
# seed included), so no worktree builds or seeds a database and none can change another's
# schema. Vitest and E2E stay on local Postgres under the worktree's own database name.
#
#   scripts/worktree-db.sh <worktree-path>            create the branch, write .env.local
#   scripts/worktree-db.sh <worktree-path> --delete   delete the worktree's Neon branch
#
# Needs the `neon` CLI, signed in. Connection strings go into the worktree's .env.local and
# are never printed.
set -euo pipefail

worktree="$(cd "${1:?usage: scripts/worktree-db.sh <worktree-path> [--delete]}" && pwd)"
repo="$(cd "$(dirname "$0")/.." && pwd)"
project="$(node -e 'try{process.stdout.write(require(process.argv[1]).projectId)}catch{}' "$repo/.neon")"
project="${NEON_PROJECT_ID:-${project:-lingering-bonus-85587787}}"
name="$(basename "$worktree" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '_')"
branch="wt-$name"

# The Neon CLI writes the linked branch's DATABASE_URL into .env.local on some commands
# (AGENTS.md); run it from a directory that has none.
neonq() { (cd /tmp && neon --project-id "$project" "$@"); }

if [ "${2:-}" = "--delete" ]; then
	neonq branches delete "$branch" >/dev/null
	echo "Deleted Neon branch $branch."
	exit 0
fi

if ! neonq branches get "$branch" >/dev/null 2>&1; then
	neonq branches create --name "$branch" --parent dev >/dev/null
	echo "Created Neon branch $branch from dev."
fi
url="$(neonq connection-string "$branch")"

env_file="$worktree/.env.local"
[ -f "$env_file" ] || cp "$repo/.env.local" "$env_file"
python3 - "$env_file" "$url" "$name" <<'PY'
import sys
path, url, name = sys.argv[1:4]
lines = [l for l in open(path).read().splitlines()
         if not l.startswith(("DATABASE_URL=", "TEST_DATABASE_URL="))]
lines += [
    "# This worktree's Neon branch (scripts/worktree-db.sh); tests stay on local Postgres.",
    f'DATABASE_URL="{url}"',
    f'TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nhip_test_{name}"',
]
open(path, "w").write("\n".join(lines) + "\n")
PY
echo "Wrote DATABASE_URL (Neon $branch) and TEST_DATABASE_URL (local nhip_test_$name) to $env_file."

# The branch carries main's schema; bring it to this worktree's.
(cd "$worktree" && pnpm --filter @repo/database generate >/dev/null && pnpm --filter @repo/database push >/dev/null)
echo "Pushed this worktree's schema to $branch."
