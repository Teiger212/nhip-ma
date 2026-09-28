#!/usr/bin/env bash
# test-author works from intent: it may read docs, specs, test config and the seed logins,
# and write only specs and the scenarios doc. Exit 2 refuses the call with the reason.
exec python3 -c '
import json, os, sys
e = json.load(sys.stdin)
tool, inp = e.get("tool_name"), e.get("tool_input", {})
root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or e.get("cwd") or os.getcwd())
raw = inp.get("file_path") or inp.get("path") or root
path = os.path.realpath(raw if os.path.isabs(raw) else os.path.join(root, raw))
rel = os.path.relpath(path, root)
def under(*prefixes):
    return any(rel == p.rstrip("/") or rel.startswith(p) for p in prefixes)
tests = under("apps/saas/tests/", "apps/marketing/tests/")
readable = rel == "." or tests or under(
    "docs/", "CONTEXT.md", "PRODUCT.md", "ARCHITECTURE.md", "AGENTS.md", "CLAUDE.md", "README.md",
    "apps/saas/playwright.config.ts", "apps/marketing/playwright.config.ts",
    "apps/saas/modules/inbox/lib/walk-user.ts", ".agents/skills/", ".claude/skills/",
    "packages/i18n/translations/",
    "node_modules/@playwright/", "package.json", "apps/saas/package.json", "apps/marketing/package.json",
) or rel.startswith("..") and "/.claude/skills/" in path
writable = tests or rel == "docs/e2e-scenarios.md"
if tool in ("Write", "Edit"):
    if writable: sys.exit(0)
    print(f"test-author writes only specs (apps/*/tests/) and docs/e2e-scenarios.md, not {rel}.", file=sys.stderr); sys.exit(2)
if readable: sys.exit(0)
print(f"test-author works from intent and may not read {rel}. Use the scenario, the docs and the running app; ask the main session for a data-test hook if one is needed.", file=sys.stderr); sys.exit(2)
'
