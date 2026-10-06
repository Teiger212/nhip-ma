## 2026-10-06 (workflows pin the pnpm action to a commit)

### Security

- **Every workflow pins `pnpm/action-setup` to its v4 commit** (#200 follow-up, from a security review of `changelog.yml`). The changelog fold pushes to main with `contents: write`, so a moved `v4` tag could have run someone else's code with that access. Production smoke already pinned it; CI, Format, Staging smoke and the fold now do too.
