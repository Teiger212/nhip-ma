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
    # Exact commands take no arguments; Playwright takes its own, except another config.
    exact = (("pnpm", "lint"), ("pnpm", "format"), ("pnpm", "type-check"), ("git", "status"))
    playwright = (
        ("pnpm", "exec", "playwright"), ("pnpm", "--filter", "saas", "exec", "playwright"),
        ("pnpm", "--filter", "saas", "e2e"), ("pnpm", "--filter", "saas", "smoke"),
        ("pnpm", "--filter", "marketing", "e2e"), ("npx", "playwright"),
    )
    configs = ("playwright.config.ts", "playwright.smoke.config.ts")
    # Newlines and a lone & separate commands in bash as much as ; does.
    for segment in re.split(r"&&|\|\||;|\||&|\n|\r", command):
        try:
            words = shlex.split(segment)
        except ValueError:
            refuse("test-author could not parse that command.")
        while words and re.match(r"^[A-Z_][A-Z0-9_]*=", words[0]):
            words = words[1:]  # E2E_PORT=3100 and the like
        if not words or (words[0] == "cd" and len(words) == 2):
            continue
        # The build-once E2E server (#205): start it, check it, stop it; nothing else. Only as
        # the whole command, with no `cd` before it and nothing in front but E2E_PORT or E2E_HTTPS_PORT: the path is
        # resolved against the cwd the hook sees, which a `cd` would make differ from the one bash uses, and an
        # environment variable such as BASH_ENV would run other code inside the script.
        if os.path.basename(words[0]) == "e2e-server.sh":
            whole = shlex.split(command) if not re.search(r"&&|\|\||;|\||&|\n|\r", command) else None
            while whole and re.fullmatch(r"E2E_(HTTPS_)?PORT=[0-9]+", whole[0]):
                whole = whole[1:]  # only the ports may be set in front
            script = os.path.realpath(os.path.join(cwd, words[0]))
            if (whole == words and script == os.path.join(checkout_of(cwd), "scripts", "e2e-server.sh")
                    and all(w in ("--status", "--stop") for w in words[1:])):
                continue
            refuse("test-author runs scripts/e2e-server.sh only on its own, from its checkout, as `scripts/e2e-server.sh [--status|--stop]`.")
        runs_playwright = any(tuple(words[: len(prefix)]) == prefix for prefix in playwright)
        own_config = all(
            os.path.basename(word.split("=", 1)[-1]) in configs
            for i, word in enumerate(words)
            if word.startswith("--config") or (i > 0 and words[i - 1] in ("-c", "--config"))
        ) and "-c" not in words[-1:] and "--config" not in words[-1:]
        if not (tuple(words) in exact or (runs_playwright and own_config)):
            refuse(f"test-author runs only Playwright, scripts/e2e-server.sh, lint, format, type-check and git status, not: {segment.strip()}. Read and write files with the file tools.")
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
    "apps/saas/modules/inbox/lib/demo-user.ts", ".agents/skills/", ".claude/skills/",
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
