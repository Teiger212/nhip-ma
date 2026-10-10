## 2026-10-10 (the river office shows the model's drafts)

### Added

- **AI drafts in the river demo office** (#302, ADR 0024). Seven threads hold a waiting "Suggested reply · AI", and four of them also have an earlier model draft that was approved and sent. The text was written once by Haiku 5.5 and committed; `pnpm seed` still calls no model, and `pnpm seed:drafts` regenerates it.
