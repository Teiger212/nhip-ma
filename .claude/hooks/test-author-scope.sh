#!/usr/bin/env bash
# test-author works from intent: it may read docs, specs, test config and the seed logins,
# and write only specs and the scenarios doc. Bash runs only the test, lint, format and type
# commands, never a way around the file rules. Exit 2 refuses the call with the reason.
exec python3 -c '
import json, os, re, shlex, sys
e = json.load(sys.stdin)
tool, inp = e.get("tool_name"), e.get("tool_input", {})
project = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or e.get("cwd") or os.getcwd())
cwd = os.path.realpath(e.get("cwd") or project)

def checkout_of(path):
    """The git checkout holding path: the main one or a worktree under .claude/worktrees/."""
    probe = path if os.path.isdir(path) else os.path.dirname(path)
    while probe and probe != os.path.dirname(probe):
        if os.path.exists(os.path.join(probe, ".git")):
            return probe
        probe = os.path.dirname(probe)
    return project

def refuse(message):
    print(message, file=sys.stderr); sys.exit(2)

if tool == "Bash":
    command = inp.get("command", "")
    if re.search(r"[<>`]|\$\(", command):
        refuse("test-author runs commands without redirection or substitution; write files with Write or Edit.")
    allowed = (
        ("pnpm", "lint"), ("pnpm", "format"), ("pnpm", "type-check"),
        ("pnpm", "exec", "playwright"), ("pnpm", "--filter", "saas", "exec", "playwright"),
        ("pnpm", "--filter", "saas", "e2e"), ("pnpm", "--filter", "saas", "smoke"),
        ("pnpm", "--filter", "marketing", "e2e"), ("npx", "playwright"), ("git", "status"),
    )
    for segment in re.split(r"&&|\|\||;|\|", command):
        try:
            words = shlex.split(segment)
        except ValueError:
            refuse("test-author could not parse that command.")
        while words and re.match(r"^[A-Z_][A-Z0-9_]*=", words[0]):
            words = words[1:]  # E2E_PORT=3100 and the like
        if not words or (words[0] == "cd" and len(words) == 2):
            continue
        if not any(tuple(words[: len(prefix)]) == prefix for prefix in allowed):
            refuse(f"test-author runs only Playwright, lint, format, type-check and git status, not: {segment.strip()}. Read and write files with the file tools.")
    sys.exit(0)

raw = inp.get("file_path") or inp.get("path") or cwd
path = os.path.realpath(raw if os.path.isabs(raw) else os.path.join(cwd, raw))
root = checkout_of(path)
rel = os.path.relpath(path, root)
def under(*prefixes):
    return any(rel == p.rstrip("/") or rel.startswith(p) for p in prefixes)
tests = under("apps/saas/tests/", "apps/marketing/tests/")
readable = rel == "." or tests or under(
    "docs/", "CONTEXT.md", "PRODUCT.md", "ARCHITECTURE.md", "AGENTS.md", "CLAUDE.md", "README.md", "DESIGN.md",
    "apps/saas/playwright.config.ts", "apps/saas/playwright.smoke.config.ts", "apps/marketing/playwright.config.ts",
    "apps/saas/modules/inbox/lib/walk-user.ts", ".agents/skills/", ".claude/skills/",
    "packages/i18n/translations/",
    "node_modules/@playwright/", "package.json", "apps/saas/package.json", "apps/marketing/package.json",
) or rel.startswith("..") and "/.claude/skills/" in path
# Setup that writes the database or mints sessions with privileged helpers: the main session owns it.
privileged = rel in (
    "apps/saas/tests/support/test-auth.ts", "apps/saas/tests/sessions.setup.ts",
    "apps/saas/tests/support/pipes.ts", "apps/saas/tests/support/crm.ts",
) or bool(re.fullmatch(r"apps/saas/tests/support/[\w-]+-state\.ts", rel))
writable = (tests and not privileged) or rel == "docs/e2e-scenarios.md"
if tool in ("Write", "Edit"):
    if writable: sys.exit(0)
    refuse(f"test-author writes only specs (apps/*/tests/, except the setup that writes the database or mints sessions) and docs/e2e-scenarios.md, not {rel}.")
if tool == "Grep" and rel == ".":
    refuse("test-author greps a path it may read (apps/saas/tests, docs, ...), not the whole checkout: that searches application source.")
if readable: sys.exit(0)
refuse(f"test-author works from intent and may not read {rel}. Use the scenario, the docs and the running app; ask the main session for a data-test hook if one is needed.")
'
