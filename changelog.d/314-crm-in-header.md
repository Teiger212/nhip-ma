## 2026-10-11 (The CRM status in the thread header; clear the search)

### Added

- **Clear the inbox search in one tap** (#314). While the search holds text, an X at its end
  empties it, brings back the whole list and leaves the cursor in the field.

### Changed

- **The CRM status sits in the thread header** (#314; Eyal, 2026-10-11). With the guest's
  details open beside the thread, "In CRM" or "Not in CRM yet" now follows Your turn in the
  header, past a thin divider, and the details lose their CRM section. An office with no CRM
  shows neither. "In CRM" still opens the lead where the CRM has a web app.
- **No count line under the inbox's view tabs** (#314; Eyal, 2026-10-11). The tabs already
  show each view's full count, so "7 unassigned · 18 waiting in the office" or "6 guests are
  waiting on you" only repeated them. With "Showing" on one person, the tabs count theirs.
