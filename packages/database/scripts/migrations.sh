#!/usr/bin/env bash
# Migrations for hosted environments (ADR 0016). Dev keeps `db push`; these never touch the
# dev database. `check` and `new` replay prisma/migrations into a throwaway database on the
# same server and diff it against prisma/schema.prisma.
#   migrations.sh check         exit 1 if schema.prisma has changes no migration covers
#   migrations.sh new <name>    write prisma/migrations/<timestamp>_<name>/migration.sql
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL must be set (the server to borrow a throwaway database from)}"
url_with_db() { node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/"+process.argv[1];u.search="";process.stdout.write(u.toString())' "$1"; }
SCRATCH_DB="nhip_migrations_$$"
ADMIN_URL=$(url_with_db postgres)
SCRATCH_URL=$(url_with_db "$SCRATCH_DB")
cleanup() { psql "$ADMIN_URL" -qc "drop database if exists $SCRATCH_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
psql "$ADMIN_URL" -qc "create database $SCRATCH_DB" >/dev/null
DATABASE_URL="$SCRATCH_URL" pnpm exec prisma migrate deploy >/dev/null

case "${1:-}" in
  check)
    if DATABASE_URL="$SCRATCH_URL" pnpm exec prisma migrate diff --from-config-datasource \
      --to-schema prisma/schema.prisma --exit-code >/dev/null; then
      echo "Migrations match schema.prisma."
    else
      echo "schema.prisma has changes no migration covers. Run: pnpm --filter @repo/database migrate:new <name>" >&2
      exit 1
    fi ;;
  new)
    name="${2:?usage: migrations.sh new <name>}"
    dir="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_${name}"
    mkdir -p "$dir"
    DATABASE_URL="$SCRATCH_URL" pnpm exec prisma migrate diff --from-config-datasource \
      --to-schema prisma/schema.prisma --script -o "$dir/migration.sql"
    if ! grep -qv '^--' "$dir/migration.sql"; then rm -rf "$dir"; echo "No schema changes; nothing written."; exit 0; fi
    echo "Wrote $dir/migration.sql — review it before committing." ;;
  *) echo "usage: migrations.sh check | new <name>" >&2; exit 2 ;;
esac
