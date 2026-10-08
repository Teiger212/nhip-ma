## 2026-10-08 (The model's suggested reply follows ADR 0024's rules)

### Changed

- **The model's suggested reply is written by ADR 0024's six rules** (#251, ADR 0024, ADR 0025). The model reads the last 10 messages, the auto-reply included, the guest details and the auto-reply's open questions; no phone number or email reaches it. It never introduces anyone, promises actions rather than claiming stock, defers prices, fees, legal answers, availability and viewing times to the agent, never repeats a question the office already asked, and writes 2 to 4 short sentences. It answers JSON with the reply in the guest's language and the same reply in the office language, which is stored with the draft (a new nullable column, `inbox_draft.officeReply`). A malformed answer leaves the template.
- **The post-check blocks answers, not mentions** (#251). A draft that states a price, an availability, a viewing time or a legal answer, or writes a number the guest didn't, is dropped and the template stands, in either text. "I'll check the ownership rules for you" now passes; "Happy to arrange a viewing on Friday" is now blocked.
