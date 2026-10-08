## 2026-10-08 (the office reads Nhịp in its language)

### Changed

- **Every member of an office reads Nhịp in the office language** (#256, ADR 0025). An agent or
  manager on the other language's address lands on the same page in the office's (`/en/inbox`
  to `/vi/inbox` in a Vietnamese office, a thread's link included), and an open page follows
  when the manager changes it. The user menu's EN/VI toggle and the account settings' language
  select are gone for office members; the platform admin keeps both. The sign-in pages keep
  their own switch.
- **Alerts are in the office language** (#256, ADR 0025): a new guest's alert, an assignment's,
  a returned thread's and the test alert, their text and their link, whatever each person's own
  setting. They were in each person's language, and Vietnamese when none was set.
