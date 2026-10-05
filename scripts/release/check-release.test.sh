#!/usr/bin/env bash
# Checks the release gate against commits whose staging and CI history is known (#112, #190).
# It reads GitHub, so it runs by hand, not in CI: `scripts/release/check-release.test.sh`.
# Needs `gh` signed in and `origin` fetched.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1
gate=scripts/release/check-release.sh
failures=0

# expect <accept|refuse> <commit> <text the verdict must contain> <why this case>
expect() {
	local want=$1 commit=$2 text=$3 why=$4 output status
	output=$("$gate" "$commit" 2>&1)
	status=$?
	if { [[ $want == accept ]] && ((status != 0)); } || { [[ $want == refuse ]] && ((status == 0)); }; then
		echo "FAIL ($why): wanted $want, got exit $status: $output"
		failures=$((failures + 1))
	elif [[ $output != *"$text"* ]]; then
		echo "FAIL ($why): output lacks \"$text\": $output"
		failures=$((failures + 1))
	else
		echo "ok   $why"
	fi
}

git fetch --quiet origin main production

expect accept bf0767d "its CI on main passed" "a main merge that staging deployed and smoked, and CI passed on, is released"
expect refuse 2f3a499 "CI on main was cancelled" "a main merge staging smoked, whose CI on main was cancelled, is refused (#190)"
expect refuse fe5cc27 "never deployed on staging" "a main commit staging never built (only its merge was) is refused"
# #146's probe, closed unmerged ("do not merge"); docs/attio-adr, used before, has since merged.
expect refuse 420893d "not on main" "a branch commit is refused"
expect refuse 7baa32d "already" "production's own commit has nothing to release"
expect refuse 7baa32d~1 "behind production" "an older commit is refused: rollback is Vercel's instant rollback"
expect refuse 0000000000000000000000000000000000000000 "not a commit" "an unknown commit is refused"

if ((failures > 0)); then
	echo "$failures case(s) failed"
	exit 1
fi
echo "all cases pass"
