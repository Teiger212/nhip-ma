#!/usr/bin/env bash
# The release gate (ADR 0016, #112): may `production` move to this commit? Prints the verdict
# and exits 0 only when every condition holds:
#   - the commit is on `main`;
#   - it is ahead of `production`, so the move is a fast-forward (an older commit is a
#     rollback, which is Vercel's instant rollback, never a release);
#   - Vercel deployed it on staging (a `Preview` deployment of that commit that succeeded);
#   - the staging smoke run passed against that deployment.
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
staging_url=""
for id in $(gh api "repos/{owner}/{repo}/deployments?sha=$sha&environment=Preview&per_page=100" --jq '.[].id'); do
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

echo "OK: $short is on main, ahead of production (${production:0:7}); staging deployed it ($staging_url) and its smoke run passed."
