# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## How work is divided (decided 2026-10-04)

The board is the GitHub project **Nhịp** (https://github.com/users/Teiger212/projects/4), linked to this repo.

- **Epic**: a parent issue titled `Epic: …`, one job to be done (e.g. #101, "Attio as the first client's CRM").
  - Its body says the job, lists the PRs it **shipped**, and says what's open.
  - Once specced, its body is the spec, as #59's is.
  - Every issue, done or not, sits under exactly one epic, as a GitHub **sub-issue**: `gh api -X POST repos/Teiger212/nhip-ma/issues/<epic>/sub_issues -F sub_issue_id=<child-db-id>`, where `<child-db-id>` comes from `gh api repos/Teiger212/nhip-ma/issues/<n> --jq .id`.
- **Ticket**: one sub-issue = one PR = one agent session, independently testable (red first). Size S or M; an L is split.
- **Task**: a checklist inside a ticket, never its own issue.
- **Milestone** says _when_: `First client · 2026-10-18` or `After first client`. Every open ticket has one; epics don't, since they span milestones.
- **Labels** stay the triage state (`needs-triage` … `ready-for-agent`); the board adds views, not a second status.
- **A new ticket** goes under its epic, with a milestone and a triage label, and onto the board: `gh project item-add 4 --owner Teiger212 --url <issue-url>`. Built-in workflows add it automatically once Eyal turns them on.
- **A merged PR with no ticket** is listed in its epic's "Shipped" section.

**The board's views:**

| View         | Layout  | Shows                                                                        |
| ------------ | ------- | ---------------------------------------------------------------------------- |
| Epics        | Table   | Top-level epics with their sub-issue progress; expand one to see its tickets |
| First Client | Board   | `milestone:"First client · 2026-10-18"`, by status                           |
| Backlog      | Table   | `milestone:"After first client"`                                             |
| Roadmap      | Roadmap | `has:target`: dated epics on a timeline, with milestone markers              |

**Dates:**

- Only epics carry the project's **Start** and **Target** date fields; tickets stay undated, and their order lives in the First Client board.
- An epic goes on the roadmap when it gets both dates.
- Plan code in days, not weeks. Date an epic by what actually gates it: a vendor, an account, Eyal's manual steps.
- Set dates with `gh project item-edit --id <item-id> --project-id <project-id> --field-id <Start|Target field id> --date YYYY-MM-DD`. Get the ids from `gh project field-list 4 --owner Teiger212` and `gh project item-list 4 --owner Teiger212`.

**Status moves by itself:** open issues and PRs are added as Todo, and closing an issue or merging a PR sets Done (the board's workflows: auto-add filter `is:issue,pr is:open`, Item closed, Pull request merged). Don't track triage state in Status; that's the labels' job.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
