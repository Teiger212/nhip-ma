## 2026-10-11 (EN and VI guests only, until after the demo)

### Changed

- **Nhịp replies to English and Vietnamese guests in their language, and to Japanese, Korean
  and Russian guests in English for now** (#306, ADR 0021 and ADR 0024 as amended). A new
  setting, `SUPPORTED_GUEST_LANGUAGES` (default `en,vi`, checked at startup), decides which
  guest languages get replies in their own language; the Japanese, Korean and Russian copy
  stays in the code and comes back by config. The office's first message to such a guest (the
  auto-reply, or the first suggested reply when it is off) carries "We reply in English. If you
  can write to us in English, we'll help you faster." once. Their messages are still
  translated for the agent; the Language row and the operator note say the reply is in
  English. The demo seeds and the river office's AI drafts follow.
