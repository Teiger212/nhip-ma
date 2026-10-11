## 2026-10-11 (Guest messages translated by Gemini 3.1 Flash-Lite)

### Changed

- **Translations come from Gemini 3.1 Flash-Lite** (#254, ADR 0024). `TRANSLATE_MODEL` now
  defaults to `google/gemini-3.1-flash-lite`, the translation eval's pick: over 82 guest messages
  it returned no broken translation, where Haiku 5.5 returned one and twice added a detail the
  guest never wrote. Drafts stay on Haiku 5.5; `TRANSLATE_MODEL` still overrides the default.
