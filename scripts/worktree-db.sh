#!/usr/bin/env bash
# A worktree's own databases, so worktrees on different schemas never break each other:
#   dev   nhip_dev_<name>   local Postgres, schema pushed and seeded (or, with --neon, a
#                           copy-on-write child of the Neon `dev` branch, for remote sessions)
#   test  nhip_test_<name>  local; Vitest creates and wipes it
#   e2e   nhip_e2e_<name>   local; Playwright creates and reseeds it
#
#   scripts/worktree-db.sh <worktree-path> [--neon]   create, push, seed, write .env.local
#   scripts/worktree-db.sh <worktree-path> --delete   drop the worktree's databases or branch
#
# Connection strings go into the worktree's .env.local and are never printed.
set -euo pipefail

worktree="$(cd "${1:?usage: scripts/worktree-db.sh <worktree-path> [--neon|--delete]}" && pwd)"
mode="${2:-local}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
name="$(basename "$worktree" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '_')"
local_server="postgresql://postgres:postgres@localhost:5432"
env_file="$worktree/.env.local"

project="$(node -e 'try{process.stdout.write(require(process.argv[1]).projectId)}catch{}' "$repo/.neon")"
project="${NEON_PROJECT_ID:-${project:-lingering-bonus-85587787}}"
branch="wt-$name"
# The Neon CLI writes the linked branch's DATABASE_URL into .env.local on some commands
# (AGENTS.md); run it from a directory that has none.
neonq() { (cd /tmp && neon --project-id "$project" "$@"); }

if [ "$mode" = "--delete" ]; then
	if grep -q '^DATABASE_URL=.*neon' "$env_file" 2>/dev/null; then
		neonq branches delete "$branch" >/dev/null && echo "Deleted Neon branch $branch."
	fi
	for db in "nhip_dev_$name" "nhip_test_$name" "nhip_e2e_$name"; do
		psql "$local_server/postgres" -qc "drop database if exists $db" >/dev/null
	done
	echo "Dropped the local databases nhip_{dev,test,e2e}_$name."
	exit 0
fi

if [ "$mode" = "--neon" ]; then
	if ! neonq branches get "$branch" >/dev/null 2>&1; then
		neonq branches create --name "$branch" --parent dev >/dev/null
		echo "Created Neon branch $branch from dev (schema and seed included)."
	fi
	dev_url="$(neonq connection-string "$branch")"
else
	dev_url="$local_server/nhip_dev_$name"
	if ! psql "$local_server/postgres" -tAc "select 1 from pg_database where datname = 'nhip_dev_$name'" | grep -q 1; then
		psql "$local_server/postgres" -qc "create database nhip_dev_$name" >/dev/null
		fresh=1
	fi
fi

[ -f "$env_file" ] || cp "$repo/.env.local" "$env_file"
python3 - "$env_file" "$dev_url" "$local_server" "$name" <<'PY'
import sys
path, dev_url, server, name = sys.argv[1:5]
lines = [l for l in open(path).read().splitlines()
         if not l.startswith(("DATABASE_URL=", "TEST_DATABASE_URL=", "E2E_DATABASE_URL="))
         and not l.startswith("# This worktree's databases")]
lines += [
    "# This worktree's databases (scripts/worktree-db.sh).",
    f'DATABASE_URL="{dev_url}"',
    f'TEST_DATABASE_URL="{server}/nhip_test_{name}"',
    f'E2E_DATABASE_URL="{server}/nhip_e2e_{name}"',
]
open(path, "w").write("\n".join(lines) + "\n")
PY
echo "Wrote DATABASE_URL, TEST_DATABASE_URL and E2E_DATABASE_URL to $env_file."

# Bring the dev database to this worktree's schema; seed a new local one.
(cd "$worktree" && pnpm --filter @repo/database generate >/dev/null && pnpm --filter @repo/database push >/dev/null)
if [ "${fresh:-0}" = 1 ]; then (cd "$worktree" && pnpm seed >/dev/null); fi
echo "Dev database ready: $([ "$mode" = "--neon" ] && echo "Neon $branch" || echo "local nhip_dev_$name")."
