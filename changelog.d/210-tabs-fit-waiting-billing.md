## 2026-10-06 (the view tabs fit their counts, the manager's Waiting view, office Billing hidden)

### Changed

- **A manager's "Your turn" view reads "Waiting"** (#210, ADR 0022). A manager's view of every
  guest the office owes a reply is labelled "Waiting N" (VI "Đang chờ N"), not "Your turn N". It
  holds the same threads, and N is the same office-wide count as the nav badge, the tab title and
  the count line. Agents keep "Your turn".
- **The office Billing page is hidden** (#210, ADR 0022). `/<office>/settings/billing` joins the
  account Billing page in `kit-screens.ts`: it answers with the not-found page, as the other
  hidden kit screens do, until the office's per-seat billing is built (ADR 0014). It is hidden,
  not deleted.

### Fixed

- **The Inbox's view tabs stay on one line** (#210). Two- and three-digit counts and the
  Vietnamese labels no longer wrap a tab onto two lines, and the row never scrolls sideways.
  Each tab grows to fit its label and full count; when the row runs short, the tabs' side
  padding steps down first, from 12px to 8px, then 4px.
