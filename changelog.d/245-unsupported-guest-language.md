## 2026-10-08 (an unsupported guest language is named)

### Changed

- **A guest who writes in a language Nhịp doesn't support is named, not read as English** (#245,
  ADR 0021 R4 as amended). The language is detected locally, with no model call: the five
  supported languages keep their script and letter rules, Chinese and Thai are read from their
  scripts, and other Latin-script text from a small language-ID library (eld). The details'
  Language row reads "French · not supported, replies in English"; the operator note, Home's
  Waiting now and the alerts name French too. The guest still gets the English greeting and an
  English suggested reply. Their messages aren't translated: each shows "French isn't supported:
  no translation" where the translation would be. The VI copy is pending a native read (#78).
  A new guest's CRM lead records the named language too ("fr"), not English. The walk office's
  French and Chinese guests show it after `pnpm seed -- --reset`.
