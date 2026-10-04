#!/usr/bin/env bash
# Lint migrations with Squawk (#98): every migration must work with the code before it (AGENTS.md,
# "Schema changes are expand/contract"). Rules, and why some are off: .squawk.toml.
#   lint-migrations.sh <file>...       lint these files
#   lint-migrations.sh --since <ref>   lint the migrations added between <ref> and HEAD (CI passes
#                                      the PR's base); applied migrations are never linted again
set -euo pipefail
cd "$(dirname "$0")/.."

files=()
if [ "${1:-}" = --since ]; then
	ref="${2:?usage: lint-migrations.sh --since <ref>}"
	while IFS= read -r file; do files+=("$file"); done < <(
		git diff --name-only --relative --diff-filter=A "$ref" HEAD -- 'prisma/migrations/*/migration.sql'
	)
	if [ "${#files[@]}" -eq 0 ]; then
		echo "No new migrations to lint."
		exit 0
	fi
else
	files=("$@")
	[ "${#files[@]}" -gt 0 ] || { echo "usage: lint-migrations.sh <file>... | --since <ref>" >&2; exit 2; }
fi

exec pnpm exec squawk --config .squawk.toml "${files[@]}"
