## 2026-10-08 (the model layer: a model per task, zero-retention, daily caps)

### Added

- **A model per task, defaulted in code** (#250, ADR 0024). Every model call is a task,
  `draft` or `translate`, with its own model: `DRAFT_MODEL` and `TRANSLATE_MODEL`, both
  `anthropic/claude-haiku-5.5` unless set. A key alone is enough to start; the startup error for
  a key without `DRAFT_MODEL` is gone. Switching a model is an env change and a redeploy.
- **Daily caps per office** (#250, ADR 0024). Drafts 50 a day (Regenerate counts), translations
  1,000 a day, from `DRAFT_DAILY_CAP` and `TRANSLATE_DAILY_CAP`, counted per model call (a retry
  counts) in the new `inbox_model_usage` table. The day runs midnight to midnight in
  Asia/Ho_Chi_Minh. Past a cap the task falls back without calling the model: the template, or
  no translation line. A capped translation isn't a failed one: it spends none of the message's
  attempts and waits out no backoff, and the thread's first open after the office's day turns
  translates it.
- **One log line per model call** (#250, ADR 0024): task, model, officeId, input and output
  tokens, latency and outcome (ok, timeout, error, capped, filtered, empty). Never message text,
  a thread id or a guest id.
- **A deterministic stub model for E2E** (#250, ADR 0024). `MODEL_STUB` names the tasks it
  answers with fixed text; production refuses it. E2E now translates guest messages with it
  ("Stub translation, Korean to Vietnamese."); its drafts are built and turn on with #252.

### Changed

- **OpenRouter only, with zero-retention routing on every request** (#250, ADR 0024). Every
  request sends `provider: { zdr: true, data_collection: "deny" }`, so guests' text is neither
  kept nor trained on. A production deployment refuses a `DRAFT_BASE_URL` other than OpenRouter.
- **A model call gives up after 20 s and is tried once more** (#250, ADR 0024), then the
  fallback stands, with no error banner. It was 30 s and no retry.
