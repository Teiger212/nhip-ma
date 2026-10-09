## 2026-10-10 (the river office shows the model's drafts)

### Added

- **AI drafts in the river demo office** (#302, ADR 0024). Four threads show a model draft that was approved and sent, with the AI label in history, and three hold a waiting "Suggested reply · AI". The text was written once by Haiku 5.5 and committed; `pnpm seed` still calls no model, and `pnpm seed:drafts` regenerates it.
