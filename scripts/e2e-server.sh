#!/usr/bin/env bash
# Build once per worktree, run many spec files against it (#205; AGENTS.md, "How E2E runs").
#
#   scripts/e2e-server.sh            (re)build and start the E2E server in the background: the
#                                    same chain and env as playwright.config.ts's webServer,
#                                    with the HTTPS proxy (E2E_PORT moves both ports)
#   scripts/e2e-server.sh --status   ports, whether it answers, whether the app source still
#                                    matches the build
#   scripts/e2e-server.sh --stop     stop it
#
# Then, from apps/saas: E2E_REUSE=1 pnpm exec playwright test <file> --workers=1
# Its state (ports, process groups, the VAPID pair, the app-source fingerprint) is in
# apps/saas/.e2e-server/, git-ignored; the logic is apps/saas/tests/support/e2e-server.ts.
set -euo pipefail

case "${1:-}" in
	"") command=start ;;
	--status) command=status ;;
	--stop) command=stop ;;
	*)
		echo "usage: scripts/e2e-server.sh [--status|--stop]" >&2
		exit 2
		;;
esac

cd "$(dirname "$0")/../apps/saas"
exec pnpm exec tsx --tsconfig tsconfig.json tests/support/e2e-server.ts "$command"
