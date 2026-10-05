#!/usr/bin/env bash
# The release gate (ADR 0016, #112): may `production` move to this commit? Prints the verdict
# and exits 0 only when every condition holds:
#   - the commit is on `main`;
#   - it is ahead of `production`, so the move is a fast-forward (an older commit is a
#     rollback, which is Vercel's instant rollback, never a release);
#   - Vercel deployed it on staging (a `Preview` deployment of that commit that succeeded);
#   - the staging smoke run passed against that deployment;
#   - CI passed on it on main: a successful `ci.yml` run (its `ci` and `e2e` jobs) from the push
#     to main of that very commit (#190).
# Reads git (`origin/main` and `origin/production` must be fetched) and GitHub through `gh`.
# Usage: scripts/release/check-release.sh <commit-ish>
set -euo pipefail

refuse() {
	echo "Refused: $*" >&2
	exit 1
}

[[ $# -eq 1 ]] || refuse "usage: check-release.sh <commit-ish>"

sha=$(git rev-parse --verify --quiet "$1^{commit}") || refuse "$1 is not a commit in this repository."
short=${sha:0:7}

git merge-base --is-ancestor "$sha" origin/main ||
	refuse "$short is not on main. Release a commit that merged to main and ran on staging."

production=$(git rev-parse origin/production)
[[ $sha != "$production" ]] || refuse "$short is already production."
if ! git merge-base --is-ancestor "$production" "$sha"; then
	if git merge-base --is-ancestor "$sha" "$production"; then
		refuse "$short is behind production (${production:0:7}). To go back, use Vercel's instant rollback (ADR 0016), not a release."
	fi
	refuse "$short branches off production (${production:0:7}); production only fast-forwards."
fi

# Any success in a deployment's history counts: a later `inactive` (a newer deploy replaced it)
# must not block releasing an older commit.
# The ids are read first, so a failed API call stops the gate instead of reading as "none".
ids=$(gh api "repos/{owner}/{repo}/deployments?sha=$sha&environment=Preview&per_page=100" --jq '.[].id')
staging_url=""
for id in $ids; do
	staging_url=$(gh api "repos/{owner}/{repo}/deployments/$id/statuses?per_page=100" \
		--jq '[.[] | select(.state == "success")][0].environment_url // empty')
	[[ -n $staging_url ]] && break
done
[[ -n $staging_url ]] ||
	refuse "$short was never deployed on staging. Only commits Vercel built from main can ship; release a later merge commit."

# staging-smoke runs on every deployment_status event, so one commit can have several runs.
smoked=$(gh api "repos/{owner}/{repo}/actions/workflows/staging-smoke.yml/runs?head_sha=$sha&status=success&per_page=1" \
	--jq '.total_count')
((smoked > 0)) || refuse "$short deployed on staging, but no staging smoke run passed for it."

# CI on main (#190): ci.yml runs on every push to main, but only on the push's head commit, and a
# newer push cancels a run still going. Any successful run counts: a re-run that passes replaces
# the failed attempt. Sets `ci_url`, or refuses.
ci_on_main() {
	local runs verdict
	# Read first, so a failed API call stops the gate instead of reading as "no run".
	runs=$(gh api "repos/{owner}/{repo}/actions/workflows/ci.yml/runs?head_sha=$1&event=push&branch=main&per_page=100")
	verdict=$(jq -r '.workflow_runs
		| (map(select(.conclusion == "success"))[0]
			// map(select(.status != "completed"))[0]
			// .[0])
		// empty
		| "\(.status) \(.conclusion // "none") \(.html_url)"' <<<"$runs")
	[[ -n $verdict ]] ||
		refuse "$short has no CI run from a push to main. Only the last commit of each push runs CI; release a later commit whose CI passed."
	local status conclusion url
	read -r status conclusion url <<<"$verdict"
	[[ $status == completed ]] ||
		refuse "$short's CI on main is still running ($status): $url. Wait for it to pass, then re-run the release."
	case $conclusion in
	success) ci_url=$url ;;
	cancelled)
		refuse "$short's CI on main was cancelled, most likely by a newer push: $url. Re-run that run and release once it passes, or release a later commit whose CI passed." ;;
	*)
		refuse "$short's CI on main didn't pass ($conclusion): $url. Fix it on main and release the fix, or re-run that run if it was a flake." ;;
	esac
}
ci_url=""
ci_on_main "$sha"

echo "OK: $short is on main, ahead of production (${production:0:7}); staging deployed it ($staging_url), its smoke run passed, and its CI on main passed ($ci_url)."
