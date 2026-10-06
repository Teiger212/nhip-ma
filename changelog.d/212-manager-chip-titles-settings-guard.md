## 2026-10-06 (the manager's Waiting chip, tab titles that name the page, managers-only office settings, the Notifications intro)

### Changed

- **A manager's turn chip reads "Waiting" on threads that aren't theirs** (#212, ADR 0022). A
  manager sees "Your turn" only on the waiting threads they own. On a colleague's waiting thread
  and on an Unassigned one the chip reads "Waiting" (VI "Đang chờ"), on the row and the thread
  header, in the same amber. Agents are unchanged. The views, counts and nav number are
  unchanged.
- **The tab title names the page** (#212, ADR 0019). While guests wait, every page's tab reads
  "(n) <Page> – Nhịp", for example "(6) Home – Nhịp" or "(6) Inbox – Nhịp", instead of #136's
  "(n) Inbox" everywhere. With nobody waiting it is the page's own title, as before.
- **Settings → Notifications says what it is for** (#212). Its subtitle reads "Choose what
  reaches you in Nhịp." (VI "Chọn những gì đến với bạn trong Nhịp."), replacing the kit's
  "Choose how you receive notifications. Disabled options are stored; everything is enabled by
  default."

### Security

- **Office settings are managers only, on the server** (#212). General, Team and Billing under
  `/<office>/settings/` each call `requireOfficeManager` first, which shows anyone without
  `organization.manage` the not-found page (404) before the page reads anything. Before, an
  agent who typed the General or Billing address got the page. Team already did this and now
  shares the helper.
