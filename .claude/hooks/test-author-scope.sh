#!/usr/bin/env bash
# test-author works from intent: it may read docs, specs, test config and the seed logins,
# and write only specs and the scenarios doc. Bash runs only the test, lint, format and type
# commands, never a way around the file rules. A guardrail against reading source by the shell,
# not a sandbox: a spec is code and runs as such. Exit 2 refuses the call with the reason.
# The rules live in test-author-scope.py, so no quoting in this file can switch them off. The
# hook fails closed: anything but a clean allow (exit 0) refuses the call, a crash included.
python3 "$(dirname "$0")/test-author-scope.py"
status=$?
[ "$status" -eq 0 ] && exit 0
exit 2
