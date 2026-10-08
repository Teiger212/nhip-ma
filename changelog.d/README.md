# Changelog fragments

A pull request never edits `CHANGELOG.md`: the format check fails one that does (#200). It adds
its entry here, as one file, `changelog.d/<issue>-<slug>.md` (for example
`changelog.d/200-changelog-fragments.md`): the issue number, then a slug of lowercase ASCII
letters, digits and hyphens (no diacritics). Nothing else goes in this folder. Two PRs that each
add a fragment never conflict.

A fragment holds one section, written exactly as `CHANGELOG.md` writes them:

```markdown
## 2026-10-05 (a short title for the change)

### Added

- **What a reader notices** (#200, ADR 0000). What changed and why it matters.

### Fixed

- **…**
```

- It starts with `## <date> (<title>)` and has no other `#` or `##` heading.
- Use only the groups it needs, in this order: `### Added`, `### Changed`, `### Fixed`,
  `### Security`.
- To change your entry before merge, edit the fragment.

On every push to main that adds fragments, `.github/workflows/changelog.yml` runs
`scripts/changelog/fold.mjs`. It folds them into `CHANGELOG.md` below `# Changelog`, newest on
top, in the order they reached main (never by filename), deletes them, and commits the result as
github-actions[bot]. `node scripts/changelog/fold.mjs --check` checks the fragments' shape
locally; the format check runs it on every PR. The fold's own tests:
`node --test scripts/changelog/fold.test.mjs`.
