## 2026-10-08 (the template suggested reply in the agent's own voice)

### Changed

- **The template suggested reply speaks as the agent** (#253, ADR 0024). One template in EN, VI,
  JA, KO and RU replaces the first-reply and follow-up templates, which thanked the guest a
  second time after the auto-reply and promised "a colleague". Until the office's first human
  reply it introduces the thread's owner by first name and the office ("Hi, I'm Lan from Saigon
  Prime."), or the office alone while the thread is Unassigned, says what the agent will do, and
  asks at most one missing detail that changes what the agent would send, never one the
  auto-reply or the office already asked. It thanks the guest only when the office has sent
  nothing at all. On a later turn it introduces no one and asks nothing. Assigning a thread
  writes its untouched template again in the new owner's name; typed text is never overwritten.
  The VI wording is pending a native read (#78); JA, KO and RU have none planned yet.
- **The reply box says who wrote the suggestion**: "Suggested reply · AI" or "Suggested reply ·
  template" (VI "Gợi ý trả lời · AI" / "Gợi ý trả lời · mẫu", pending #78).
