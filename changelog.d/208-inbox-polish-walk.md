## 2026-10-06 (Inbox polish from the UI walk)

### Added

- **A manager's count line says what the view holds** (#208, ADR 0022). Under the view tabs a
  manager reads, for example, "4 unassigned · 6 waiting in the office", worded per view, or
  "waiting on <name>" while the owner filter shows one operator. Agents keep "N guests are
  waiting on you".
- **International, coming soon** (#208). The sidebar lists International under Inbox again, as
  a disabled item marked "Coming soon": handling foreigners' documents in Vietnam. It links
  nowhere, and PRODUCT.md lists it under "Later, shown as Coming soon".

### Changed

- **"Assign to…" shows on the row you're on** (#208, ADR 0022). From `md` up, the pill on a
  manager's Unassigned rows shows on hover, on keyboard focus within the row and on the
  selected row, in the timestamp's place, so names keep the row's width. On a phone it stays
  visible, a 44px target, and on a touch screen at any width it shows on every row.

### Fixed

- **The view tabs stay put** (#208). A manager's owner filter now holds its place in every
  view, disabled in Unassigned, so the tabs and the list no longer jump 44px when switching to
  or from Unassigned.
