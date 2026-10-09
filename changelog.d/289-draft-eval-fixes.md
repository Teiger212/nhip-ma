## 2026-10-09 (Model drafts: no cut-off JSON, and the post-check blocks answers, not mentions)

### Fixed

- **Model drafts no longer run out of tokens** (#289, ADR 0024). Haiku's hidden reasoning used a
  draft's whole 768-token budget on two threads of the first eval, so the JSON never closed and
  the template stood. Anthropic models now run with reasoning off, and a draft may use 1,500
  tokens. A cut-off answer still leaves the template.
- **The post-check lets good deferrals through** (#289, ADR 0024). A number the guest or the
  office already wrote in the thread passes (the agent's "9 giờ" viewing), while a number nobody
  wrote still blocks. A deferral that names a day or a legal term passes ("I'll check Saturday
  and confirm the time", "I'll check whether it has its own pink book"); a confirmation beside a
  deferral ("Next week works, I'll check the time") still blocks. The draft eval's number check
  follows the same rule.
