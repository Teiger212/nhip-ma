#!/usr/bin/env bash
# Migrations for hosted environments (ADR 0016). Every command replays prisma/migrations into a
# throwaway database on the same server. `check` and `new` diff it against prisma/schema.prisma
# and never touch DATABASE_URL; `baseline` is the one that writes to it.
#   migrations.sh check         exit 1 if schema.prisma has changes no migration covers
#   migrations.sh new <name>    write prisma/migrations/<timestamp>_<name>/migration.sql
#   migrations.sh baseline      give a database built by `db push` a migration history: find the
#                               longest run of migrations, from the first, whose replay equals its
#                               schema, and mark those applied. `migrate deploy` applies the rest.
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
[ "${1:-}" = baseline ] || DATABASE_URL="$SCRATCH_URL" pnpm exec prisma migrate deploy >/dev/null

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
  baseline)
    if psql "$DATABASE_URL" -tAc "select to_regclass('_prisma_migrations')" | grep -q .; then
      echo "This database already has a migration history; run migrate deploy." ; exit 0
    fi
    # Same tables, columns, indexes and constraints; column order may differ (db push appends).
    schema_of() { pg_dump -s -O -x -T _prisma_migrations "$1" | grep -v -e '^--' -e '^\\' -e '^$' | sed 's/,$//' | sort; }
    target="$(schema_of "$DATABASE_URL")"
    total=0 matched=0 names=""
    for dir in prisma/migrations/*/; do
      psql "$SCRATCH_URL" -q -v ON_ERROR_STOP=1 -f "$dir/migration.sql" >/dev/null
      total=$((total + 1)) names="$names $(basename "$dir")"
      [ "$(schema_of "$SCRATCH_URL")" = "$target" ] && matched=$total
    done
    if [ "$matched" -eq 0 ]; then
      echo "No run of migrations from the first reproduces this database's schema. Not baselined." >&2
      exit 1
    fi
    last=""
    for name in $(echo $names | cut -d' ' -f1-"$matched"); do
      pnpm exec prisma migrate resolve --applied "$name" >/dev/null
      last=$name
    done
    echo "Baselined through $last ($matched of $total migrations marked applied)."
    echo "Run migrate deploy for the rest." ;;
  *) echo "usage: migrations.sh check | new <name> | baseline" >&2; exit 2 ;;
esac
