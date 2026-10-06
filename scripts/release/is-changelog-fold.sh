#!/usr/bin/env bash
# Is this commit a changelog fold (#200), the one kind of commit on main with no CI run of its
# own? `.github/workflows/changelog.yml` pushes it with GITHUB_TOKEN, which starts no workflow.
# The release gate then reads its parent's CI instead (check-release.sh). Exits 0 only when every
# condition holds, and otherwise prints the first one that fails:
#   - it has exactly one parent;
#   - its author and committer are both github-actions[bot], by name and email;
#   - its subject is `docs(changelog): fold <n> fragment(s)`;
#   - against its parent it modifies CHANGELOG.md and deletes fragments (changelog.d/*.md, no
#     deeper), and changes nothing else: no other file, no added fragment, no rename.
# The author can be forged by anyone who can push to main; what keeps the exception safe is the
# last condition: such a commit can change nothing but changelog text, which nothing builds or runs.
# Reads git only. Usage: scripts/release/is-changelog-fold.sh <commit>
set -euo pipefail

bot="github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"

no() {
	echo "$*"
	exit 1
}

[[ $# -eq 1 ]] || no "usage: is-changelog-fold.sh <commit>"
sha=$(git rev-parse --verify --quiet "$1^{commit}") || no "$1 is not a commit."

read -r -a parents <<<"$(git rev-list --parents -n 1 "$sha")"
((${#parents[@]} == 2)) || no "it has $((${#parents[@]} - 1)) parents, not one."
parent=${parents[1]}

author=$(git log -1 --format='%an <%ae>' "$sha")
committer=$(git log -1 --format='%cn <%ce>' "$sha")
[[ $author == "$bot" ]] || no "its author is $author, not $bot."
[[ $committer == "$bot" ]] || no "its committer is $committer, not $bot."

subject=$(git log -1 --format=%s "$sha")
[[ $subject =~ ^docs\(changelog\):\ fold\ [1-9][0-9]*\ fragment\(s\)$ ]] ||
	no "its subject, \"$subject\", isn't a fold's."

# NUL-separated status/path pairs, renames split into a delete and an add, so a path can't hide.
changelog=0 fragments=0
while IFS= read -r -d '' status && IFS= read -r -d '' path; do
	if [[ $status == M && $path == CHANGELOG.md ]]; then
		changelog=1
	elif [[ $status == D && $path =~ ^changelog\.d/[^/]+\.md$ && $path != changelog.d/README.md ]]; then
		fragments=$((fragments + 1))
	else
		no "it changes more than CHANGELOG.md and deleted fragments: $status $path."
	fi
done < <(git diff-tree -r -z --no-renames --no-commit-id --name-status "$parent" "$sha")
((changelog == 1 && fragments > 0)) ||
	no "it doesn't both change CHANGELOG.md and delete fragments."
