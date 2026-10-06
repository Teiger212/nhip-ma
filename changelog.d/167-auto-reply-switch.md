## 2026-10-06 (a manager turns the office's auto-reply off)

### Added

- **A manager can turn the office's auto-reply off, and on again** (#167, ADR 0021 G6 and S1).
  The switch, "Auto-reply to a new guest's first message", sits on the office's settings page
  (General), which a manager now reaches from the user menu as "Office settings", next to Team.
  Agents see neither the menu item nor the switch, and the platform admin, as with Team, stays in
  the admin area. With it off, a new guest gets no auto-reply and the reply box holds the
  first-reply template for an agent to approve, as before the auto-reply. Turning it back on
  greets only threads that begin afterwards: a guest who first wrote while it was off is never
  greeted. The switch saves through `PUT /api/office/auto-reply` `{ on }`, for managers only
  (403 for an agent, 401 signed out), under the platform's `/api/` rate limit. EN and VI.
