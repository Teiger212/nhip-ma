## 2026-10-08 (one office language, set by the manager)

### Added

- **The manager sets the office language, English or Vietnamese** (#256, ADR 0025). It sits on
  the office's settings, General tab, beside the auto-reply switch, for managers only: the API
  (`/api/office/language`) refuses an agent's change (403) and a signed-out caller (401). The
  platform admin's page for an office doesn't show it. An office whose manager hasn't set one,
  every office today, is in English.

### Changed

- **A guest message is translated once, into the office language** (#256, ADR 0025 amending
  ADR 0007). It was translated into both English and Vietnamese, so a Korean, Japanese or Russian
  message cost two model calls; now it costs one, and a message already in the office language
  costs none. The open thread shows the translation in the office language whatever the reader's
  interface language, and the server, not the browser, decides which language opening a thread
  fills. After the manager changes the language, opening an older thread translates its guest
  messages into the new one then, against the office's daily translation cap; translations in
  the old language are kept.
