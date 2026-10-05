#!/usr/bin/env bash
# Checks the release gate against commits whose staging and CI history is known (#112, #190).
# It reads GitHub, so it runs by hand, not in CI: `scripts/release/check-release.test.sh`.
# Needs `gh` signed in and `origin` fetched. The changelog fold cases (#200) run offline, on
# fabricated commits; see below.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1
gate=$PWD/scripts/release/check-release.sh
is_fold=$PWD/scripts/release/is-changelog-fold.sh
failures=0

# expect <accept|refuse> <commit> <text the verdict must contain> <why this case>
# Runs `$tool` (the gate unless a case says otherwise) in the current directory.
tool=$gate
expect() {
	local want=$1 commit=$2 text=$3 why=$4 output status
	output=$("$tool" "$commit" 2>&1)
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

tool=$is_fold
expect refuse 27b96b0 "its author is Teiger212" "a person's commit on main that touches only CHANGELOG.md isn't a changelog fold (#200)"

# The changelog fold exception (#200), offline. No fold commit exists in history yet, so these
# cases build one, and every way of forging one, in a throwaway repository. A stub `gh` answers
# staging as deployed and smoked for every commit, and CI from the fixtures `ci` writes.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/ci"
cat >"$tmp/bin/gh" <<'STUB'
#!/usr/bin/env bash
# gh api <path> [--jq <expr>]: answers already filtered, as the gate's --jq would leave them.
case $2 in
*/deployments\?*) echo 1 ;;
*/deployments/*/statuses*) echo https://staging.example ;;
*/staging-smoke.yml/runs*) echo 1 ;;
*/ci.yml/runs*)
	sha=${2#*head_sha=}
	cat "$STUB_CI/${sha%%&*}.json" 2>/dev/null || echo '{"workflow_runs":[]}'
	;;
*)
	echo "stub gh: unexpected call: $*" >&2
	exit 1
	;;
esac
STUB
chmod +x "$tmp/bin/gh"
export STUB_CI=$tmp/ci PATH=$tmp/bin:$PATH

# ci <commit> <conclusion>: the commit's push run on main concluded so.
ci() {
	printf '{"workflow_runs":[{"status":"completed","conclusion":"%s","html_url":"https://ci.example/%s"}]}' \
		"$2" "$1" >"$tmp/ci/$1.json"
}

bot="github-actions[bot]|41898282+github-actions[bot]@users.noreply.github.com"
eyal="Eyal|eyal@example.com"
# commit <author name|email> <committer name|email> <message> <parent>...: commits the index.
commit() {
	local author=$1 committer=$2 message=$3 parents=()
	shift 3
	for parent; do parents+=(-p "$parent"); done
	GIT_AUTHOR_NAME=${author%|*} GIT_AUTHOR_EMAIL=${author#*|} \
		GIT_COMMITTER_NAME=${committer%|*} GIT_COMMITTER_EMAIL=${committer#*|} \
		git commit-tree "$(git write-tree)" ${parents[@]+"${parents[@]}"} -m "$message"
}
put() { git update-index --add --cacheinfo "100644,$(printf '%s\n' "$2" | git hash-object -w --stdin),$1"; }
del() { git update-index --force-remove "$1"; }
fold() { git read-tree "$1" && put CHANGELOG.md "# Changelog ${2:-folded}"; }

git init --quiet "$tmp/repo"
cd "$tmp/repo" || exit 1
put CHANGELOG.md "# Changelog"
put apps/x.ts "export {};"
put changelog.d/README.md "# Changelog fragments"
production=$(commit "$eyal" "$eyal" "production")
put changelog.d/1-a.md "## a"
put changelog.d/2-b.md "## b"
green=$(commit "$eyal" "$eyal" "Merge pull request #1" "$production")
ci "$green" success
git read-tree "$production" && put changelog.d/3-c.md "## c"
red=$(commit "$eyal" "$eyal" "Merge pull request #2" "$production")
ci "$red" failure
git read-tree "$production" && put changelog.d/4-d.md "## d"
no_run=$(commit "$eyal" "$eyal" "Merge pull request #3" "$production")

m="docs(changelog): fold 2 fragment(s)"
fold "$green" && del changelog.d/1-a.md && del changelog.d/2-b.md
real=$(commit "$bot" "$bot" "$m" "$green")
fold "$green" "two" && del changelog.d/1-a.md && del changelog.d/2-b.md
own_red=$(commit "$bot" "$bot" "$m" "$green")
ci "$own_red" failure
fold "$green" && del changelog.d/1-a.md
first=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$green")
fold "$first" "again" && del changelog.d/2-b.md
chained=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$first")
fold "$red" && del changelog.d/3-c.md
on_red=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$red")
fold "$no_run" && del changelog.d/4-d.md
on_no_run=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$no_run")
fold "$green" && del changelog.d/1-a.md && del changelog.d/2-b.md && put apps/x.ts "export const pwned = 1;"
with_code=$(commit "$bot" "$bot" "$m" "$green")
fold "$green" && del changelog.d/1-a.md && del apps/x.ts && put changelog.d/x.md "export {};"
renamed_in=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$green")
fold "$green" && del changelog.d/1-a.md && put changelog.d/5-e.md "## e"
adds_fragment=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$green")
fold "$green" && del changelog.d/1-a.md && del changelog.d/README.md
drops_readme=$(commit "$bot" "$bot" "docs(changelog): fold 2 fragment(s)" "$green")
git read-tree "$green" && del changelog.d/1-a.md &&
	git update-index --cacheinfo "120000,$(printf 'apps/x.ts' | git hash-object -w --stdin),CHANGELOG.md"
symlinked=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$green")
fold "$green" && del changelog.d/1-a.md
zero_subject=$(commit "$bot" "$bot" "docs(changelog): fold 0 fragment(s)" "$green")
fold "$green"
no_fragment=$(commit "$bot" "$bot" "docs(changelog): fold 1 fragment(s)" "$green")
fold "$green" && del changelog.d/1-a.md && del changelog.d/2-b.md
forged_email=$(commit "github-actions[bot]|bot@example.com" "$bot" "$m" "$green")
human_committer=$(commit "$bot" "$eyal" "$m" "$green")
other_subject=$(commit "$bot" "$bot" "docs(changelog): tidy" "$green")
merge=$(commit "$bot" "$bot" "$m" "$green" "$red")

# main's tip merges every case, so each one is on main and ahead of production.
tip=$(commit "$eyal" "$eyal" "tip" "$green" "$red" "$no_run" "$real" "$own_red" "$first" "$chained" \
	"$on_red" "$on_no_run" "$with_code" "$renamed_in" "$adds_fragment" "$drops_readme" "$symlinked" "$zero_subject" "$no_fragment" \
	"$forged_email" "$human_committer" "$other_subject" "$merge")
git update-ref refs/remotes/origin/main "$tip"
git update-ref refs/remotes/origin/production "$production"

tool=$gate
expect accept "$real" "its parent ${green:0:7} stands for it: its CI on main passed (https://ci.example/$green)" "a fold commit with no CI run of its own is released on its parent's green CI (#200)"
expect accept "$first" "its parent ${green:0:7} stands for it" "a fold of one fragment is released the same way"
expect refuse "$on_red" "parent ${red:0:7}'s CI on main didn't pass (failure)" "a fold commit whose parent's CI failed is refused"
expect refuse "$on_no_run" "parent ${no_run:0:7} has no CI run" "a fold commit whose parent has no CI run is refused"
expect refuse "$chained" "parent ${first:0:7} has no CI run" "a fold on top of a fold is refused: the exception doesn't chain"
expect refuse "$own_red" "${own_red:0:7}'s CI on main didn't pass (failure)" "a fold commit's own failed CI run is never set aside for its parent's"
expect refuse "$no_run" "isn't a changelog fold commit either: its author is Eyal" "a person's commit with no CI run is refused, as before"
expect refuse "$with_code" "changes more than CHANGELOG.md and deleted fragments: M apps/x.ts" "a bot commit that also changes code is refused"
expect refuse "$renamed_in" "D apps/x.ts" "a bot commit that renames code into changelog.d/ is refused"
expect refuse "$adds_fragment" "A changelog.d/5-e.md" "a bot commit that adds a fragment is refused"
expect refuse "$drops_readme" "D changelog.d/README.md" "a bot commit that deletes changelog.d/README.md is refused"
expect refuse "$symlinked" "T CHANGELOG.md" "a bot commit that turns CHANGELOG.md into a symlink is refused"
expect refuse "$zero_subject" "isn't a fold's" "a bot commit that says it folded 0 fragments is refused"
expect refuse "$no_fragment" "doesn't both change CHANGELOG.md and delete fragments" "a bot commit that deletes no fragment is refused"
expect refuse "$forged_email" "its author is github-actions[bot] <bot@example.com>" "a commit with the bot's name but another email is refused"
expect refuse "$human_committer" "its committer is Eyal" "a bot-authored commit a person committed is refused"
expect refuse "$other_subject" "isn't a fold's" "a bot commit without the fold's subject is refused"
expect refuse "$merge" "it has 2 parents" "a merge commit is refused, even by the bot"

if ((failures > 0)); then
	echo "$failures case(s) failed"
	exit 1
fi
echo "all cases pass"
