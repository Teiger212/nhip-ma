#!/usr/bin/env bash
# The release gate (ADR 0016, #112): may `production` move to this commit? Prints the verdict
# and exits 0 only when every condition holds:
#   - the commit is on `main`;
#   - it is ahead of `production`, so the move is a fast-forward (an older commit is a
#     rollback, which is Vercel's instant rollback, never a release);
#   - Vercel deployed it on staging (a `Preview` deployment of that commit that succeeded);
#   - the staging smoke run passed against that deployment;
#   - CI passed on it on main: a successful `ci.yml` run (its `ci` and `e2e` jobs) from the push
#     to main of that very commit (#190). The one exception is a changelog fold commit (#200),
#     which has no CI run because github-actions[bot] pushes it with GITHUB_TOKEN: it passes on
#     its parent's CI, and only when is-changelog-fold.sh confirms it changes nothing but
#     CHANGELOG.md and deleted fragments.
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

# CI on main (#190): ci.yml runs on every push to main, but only on the push's head commit. Each
# commit has its own concurrency group there, so a newer push never cancels it. Each run reports its latest attempt, so a failed re-run
# of a green run refuses; if one commit has several push runs (main reset to it), any successful
# one counts. Sets `ci_url`, or refuses. Takes the commit and how messages name it.
ci_on_main() {
	local commit=$1 who=$2 runs verdict
	# Read first, so a failed API call stops the gate instead of reading as "no run".
	runs=$(gh api "repos/{owner}/{repo}/actions/workflows/ci.yml/runs?head_sha=$commit&event=push&branch=main&per_page=100") ||
		refuse "couldn't read $who's CI runs on main (above)."
	verdict=$(jq -r '.workflow_runs
		| (map(select(.conclusion == "success"))[0]
			// map(select(.status != "completed"))[0]
			// .[0])
		// empty
		| "\(.status) \(.conclusion // "none") \(.html_url)"' <<<"$runs") ||
		refuse "couldn't read $who's CI runs on main: unexpected answer from GitHub."
	if [[ -z $verdict ]]; then
		# A changelog fold commit (#200) has no run of its own; it passes on its parent's CI. Only
		# the release's own commit gets this, never its parent, so it can't chain.
		local not_fold=""
		if [[ $commit == "$sha" ]] && not_fold=$("$(dirname "$0")/is-changelog-fold.sh" "$commit"); then
			local parent=""
			parent=$(git rev-parse "$commit^1")
			ci_fold="$short is a changelog fold commit (#200), so its parent ${parent:0:7} stands for it: "
			ci_on_main "$parent" "$short's parent ${parent:0:7}"
			return
		fi
		[[ -z $not_fold ]] || not_fold=" It isn't a changelog fold commit either: $not_fold"
		refuse "$who has no CI run from a push to main. Only the last commit of each push runs CI (and none with [skip ci]); release a later commit whose CI passed.$not_fold"
	fi
	local status conclusion url
	read -r status conclusion url <<<"$verdict"
	[[ $status == completed ]] ||
		refuse "$who's CI on main is still running ($status): $url. Wait for it to pass, then re-run the release."
	case $conclusion in
	success) ci_url=$url ;;
	cancelled)
		refuse "$who's CI on main was cancelled: $url. Re-run it, and release once it passes." ;;
	*)
		refuse "$who's CI on main didn't pass ($conclusion): $url. Fix it on main and release the fix, or, if it was a flake, re-run that run." ;;
	esac
}
ci_url="" ci_fold=""
ci_on_main "$sha" "$short"

echo "OK: $short is on main, ahead of production (${production:0:7}); staging deployed it ($staging_url), its smoke run passed, and ${ci_fold}its CI on main passed ($ci_url)."
