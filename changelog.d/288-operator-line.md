## 2026-10-09 (a model draft across an office-language change)

### Fixed

- **A model draft no longer shows or sends a mislabelled operator line** (#288, ADR 0025). When the manager changes the office language while a model draft waits, its operator-language text, written in the old language, is dropped: the reply box shows no line under it and a reply sent unedited stores none, instead of a line labelled with the new language holding the old one's text.
