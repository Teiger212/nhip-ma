## 2026-10-09 (the admin area reads as Nhịp)

### Changed

- **The admin area speaks Nhịp, not the kit** (#295). The header reads "Admin" with what the
  area holds, in place of "Administration / Manage your application."; the tabs are Offices,
  Users and Webhook log, Offices first; "organization" is "office" throughout (Office details,
  New office, Back to offices, the delete confirm and its toasts); "No results." is translated.
  The platform admin's sidebar drops the "Workspace" heading over its one item.
- **One look across the admin cards** (#295). Every card title is the Title role (People and
  Invite match Office details and Connections, here and in Settings); Save, Invite and New
  office are the primary blue; lists are rows split by hairlines on their card, with no box
  inside it; the role select is row-sized; the admin tabs and People's tabs draw the same
  underline. People lists managers first, then agents, the platform admin's own row last.
  On a phone a person's role and actions wrap under their name instead of squeezing it.

### Fixed

- **Small admin defects** (#295). The office page's People and Invite cards no longer open a
  48px gap under their description; the Users list no longer prints a stray "0" when nothing
  matches; the platform admin's role on Users is a translated "Platform admin" badge, not the
  English word "Admin"; the sidebar's "Nhịp" sets in Be Vietnam Pro so its dot below reads at
  desktop size.
