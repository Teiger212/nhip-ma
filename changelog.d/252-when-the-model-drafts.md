## 2026-10-08 (When the model drafts the suggested reply)

### Changed

- **The model drafts only after the office's first human reply** (#252, ADR 0024). Until a reply
  is sent, or one comes from the office's own app, the reply box holds the template, after the
  auto-reply too, and Regenerate writes the template again without asking the model.
- **A guest's burst gets one draft** (#252, ADR 0024). The model drafts about 30 s after a guest
  message, and a newer message restarts the wait. Opening the thread drafts at once.
- **An edited reply survives the guest writing again** (#252, ADR 0024, amending ADR 0011). A
  suggestion the agent hasn't touched follows the guest; one they typed into stays, with a quiet
  "Guest wrote again" note next to Regenerate, and sending it answers the guest's latest message
  instead of being refused. Any other send for an older message is still refused.
