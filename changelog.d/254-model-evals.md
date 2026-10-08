## 2026-10-09 (The draft and translation evals)

### Added

- **`pnpm eval:drafts` and `pnpm eval:translation`** (#254, ADR 0024). Run by hand, never in CI: they call OpenRouter with `DRAFT_API_KEY` and cost a few cents. The draft eval runs 15 walk-office threads through the draft prompt with Haiku 5.5, each after the office's first human reply, and checks every draft locally: the JSON shape, no number the guest didn't write, no repeated open question, no intro, at most 4 sentences. The translation eval runs the seed's 69 pairs (VI, JA, KO, RU into EN and VI) through Haiku 5.5 and Gemini 3.1 Flash-Lite. Each writes a side-by-side Markdown report under `reports/evals/` with tokens, latency and cost per call. `--dry-run` builds every prompt and prints the estimate; `--stub` answers with E2E's stub model.

### Changed

- **A Gemini 3.x model thinks at its lowest level** (#254, ADR 0024). Its requests send `reasoning: { effort: "minimal", exclude: true }`, since Gemini bills thinking as output; other models' requests are unchanged.
