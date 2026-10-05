# 0021. A new guest's first message gets one automatic greeting; every later message stays human-approved

Date: 2026-10-05. Status: accepted. Amends CONTEXT's "Not a guest-facing bot", ADR 0005's "Never
auto-send" and ADR 0006's per-message approval, for exactly one message per thread. Decided in
the grill of 2026-10-05 (`reports/grill-prep/first-touch-and-assignment.md`: G1–G6, R2–R4,
R7–R11, and round 4's P2, P3 and S1).

## Context

- **Today a new guest waits for a human.** The first reply is a fixed template
  (`draft.ts`, `draftReply`, in EN, VI, JA, KO and RU). It sits in the reply box until an agent
  approves it: "Thanks for writing … A colleague will reply here on this same chat."
- **Managers now assign every lead (ADR 0022).** That adds a step before any agent can answer.
  ADR 0015 rejected strict assignment because "a new guest can wait on one agent's
  availability". A greeting sent within seconds removes the wait the guest sees.
- **What we already have.**
  - Extraction is local regex (`extract.ts`): area, nationality, rent or buy, budget,
    timeframe, household.
  - The draft adapter (OpenRouter, `DRAFT_*`) writes translations and follow-ups behind a
    post-check (`drafts/guardrails.ts`).
- **Language detection misfires.** French and Spanish text with accents reads as VI
  (`language.ts`). That costs little while a human reads every reply, and much once one goes
  out on its own.
- **The law (one research agent, primary sources; not legal advice; on the lawyer's list).**
  - Vietnam's AI Law 134/2025, Art 11(1), in force 1 March 2026, says a system that interacts
    with people must be recognisable as one.
  - Nhịp is likely the provider. An undisclosed system could be medium-risk, which means a
    dossier and a notice to the Ministry of Science and Technology.
  - WhatsApp has no disclosure rule, but it needs a clear path to a human.
  - Zalo has only a general ban on misleading messages.
  - Decree 356, Art 10(3), asks for a privacy notice covering automated processing and the
    opt-out.
  - WhatsApp's Business Solution Terms, 4.7, bar sharing guests' data with a model provider
    that trains on it or keeps it.

## Decision

### One message, once per thread

- **G1.** Only the guest's **first** message on a thread gets the automatic reply, and the
  office's humans take over from there. "First" means the thread had no message of any kind
  before it. A thread that starts with the office writing from the WhatsApp or Zalo app gets
  no auto-reply.
- **Turning it on later (S1)** greets only threads that start afterwards. A thread from while it was off is never greeted.
- **G6.** The auto-reply is on by default for every office. A **manager** can turn it off for
  the office. With it off, the office works as it does today: the first-reply template sits in
  the reply box for an agent to approve.
- **What it says (G2, R3).**
  - It thanks the guest and acknowledges what they gave.
  - It asks for at most **2** missing qualifiers, in this order: rent or buy → area → budget →
    timeframe → household. If nothing is missing, it greets and acknowledges only.
  - It never mentions prices, availability, listings, legal matters, promises or times.
  - It is signed as the office, never with a made-up person's name.
- **Disclosure (R7).** Every auto-reply carries an explicit, warm **label** in the guest's
  language. It is always on, and an office cannot remove it. For example: "Auto-reply from
  Saigon Prime: a colleague will continue with you right here."
  - It is proposed as the message's last line, pending the lawyer. It names the office, so it
    is also the signature (G2).
  - Code adds the label after the post-check; the model never writes it.
  - Its wording, and "AI-assisted auto-reply" in place of "Auto-reply", are the lawyer's call.
  - It promises the path to a human that WhatsApp asks for.

### Who writes it

- **The model, within the guardrails (G4).** The model gets the guest's message as untrusted
  data, framed as the follow-up prompt frames it, plus the qualifiers already extracted and
  the ones to ask for (R3). It goes through the existing draft adapter (OpenRouter), using the
  **cheapest model that passes** a small test set of first messages in EN, VI, JA, KO and RU.
  Alternatives such as opencode come in only if OpenRouter falls short.
- **The fixed template stands in (G3, R9).** The template in the guest's language goes out
  automatically when any of these holds:
  - no model is configured;
  - the model fails, or takes longer than about **10 s**;
  - the reply fails the post-check (R2);
  - the office has reached its monthly cap (R8);
  - the guest's language can't be greeted. In that case the English template goes out.
- **Cost cap (R8).** An office gets at most about **2,000** model-written greetings a month,
  in the office's local calendar month as Home counts days. Past the cap, the template goes
  out. This is a product constant, not a setting.
- **No-training model on every call (WhatsApp Business Solution Terms 4.7; P3).**
  - Every model call goes only to endpoints that neither train on nor retain the prompt:
    the greeting, translations and follow-ups. It is one adapter setting.
  - On OpenRouter, every request carries `provider: { zdr: true, data_collection: "deny" }`
    (openrouter.ai/docs/features/provider-routing, read 2026-10-05).
  - If no such endpoint is available, the call fails and the fallback stands: the template,
    or no translation.
  - Another provider is used only with a written zero-retention or no-training term.

### The post-check (R2): checked after the model writes, before anything is sent

The model's text is checked as written, before the label is added. Any failure sends the
template instead. The reply must:

1. be non-empty and at most **400** characters (the label is not counted);
2. read as the guest's detected language (`detectLanguage(text)` equals the thread's
   language, with R4's detection);
3. ask at most **2** questions (`?` and `？` counted);
4. contain **no digits** of any script (`\p{Nd}`), so it carries no figures, phone numbers or
   prices;
5. contain no currency: no symbol (`\p{Sc}`), and no currency word from a short list per
   language (USD, VND, đồng, triệu, tỷ, 円, 万, 원, 만, руб…);
6. contain no URL and no email address;
7. contain no listing, availability, legal or promise words, from a short list per language,
   plus today's paperwork terms (`PAPERWORK_TERMS`).

Han numerals are not checked, because 一 appears in ordinary words. The currency list catches
prices written that way. The "no person's name" rule is held by the prompt only: a check can't
tell a name.

### The fallback templates (R9)

- **What they are.** One template per language (EN, VI, JA, KO, RU). Each is a greeting, an
  acknowledgement of what was extracted, and up to 2 template questions in R3's order, then
  the label.
- **Built from local regex only,** so they need no model.
- **No figures.** The acknowledgement names the area and rent or buy. A budget, timeframe or
  household is acknowledged by kind ("your budget"), never by value.
- **Who checks the text.** Eyal reviews it, plus a native read (#78).

### Language (R4)

- **Vietnamese is read only from letters that Vietnamese alone uses:** ă, â, đ, ơ, ư, a letter
  with a hook above or a dot below, ẽ ĩ ũ ỹ, and any tone mark on ă, â, ê, ô, ơ or ư.
  - The acute, the grave, ã, õ and a bare ê or ô no longer count. French, Spanish and
    Portuguese are shared on those.
  - The Vietnamese word list stays as it is.
- **When unsure, the greeting is in English.** Detection is shared, so translation and
  drafting follow the same reading. Any language other than the five reads as English.
- **â stays in the decided set, though French also uses it** ("château"). The test set
  watches it.

### The queue and the funnel (G5, R10)

- **The auto-reply is not an Answer.** It is stored as an outbound message with its own
  source, `auto-reply`, and its writer, `model` or `template`. It has no approval, no
  operator, no Answer row, and it doesn't set `Conversation.sentAt`.
- **The thread stays Your turn.** The guest's first message has no human reply yet. Your turn
  becomes "the guest's latest message has no human reply"; Sent is reached only by a human.
- **The funnel counts humans.** Engaged means a human reply was sent. In conversation means
  the guest wrote again after the first human reply. Response time runs to the first human
  reply. The funnel, and ADR 0020's lead tally, read only sent Answers and replies from the
  vendor's app, so the auto-reply is left out without changing any SQL. A test pins this.
- **It claims nothing (ADR 0022).** Ownership is unchanged, and the thread waits in
  Unassigned.
- **It alerts no one.** The guest's message alerts as ADR 0019 and ADR 0022 say; the
  auto-reply adds nothing to that.

### In the thread (R11)

- **How it shows.** The auto-reply shows as the office's message. Its meta line carries a
  small neutral **"Auto-reply"** badge, squared (DESIGN.md, The Pill Acts Rule), followed by
  "Model" or "Template".
- **The reply box (R11, P2)** takes the follow-up path once the greeting is sent. That
  covers the first message, still unanswered, and every message after it. The model drafts
  from the whole conversation, knowing the greeting went out, so it never greets twice. With
  no model, the box holds the follow-up template.

## Considered options

- **Keep today's agent-approved template.** It keeps "a human approves every message", but a
  new guest hears nothing until someone is free. Under ADR 0022, "someone" is first a manager,
  then an agent.
- **Send the fixed template automatically, no model.** Safest, and it is the fallback. It
  can't acknowledge what the guest wrote beyond the regex facts, and it asks the same
  questions everyone gets.
- **Let the model answer more than the first message.** That would make Nhịp a bot, and it is
  not decided.

## Consequences

- **Data, all additive (`migrate:new`, expand only).**
  - A `MessageSource` value `auto_reply` (on disk; `auto-reply` in the domain).
  - A nullable `inbox_message.writtenBy` (`DraftSource`: `template` or `model`).
  - A nullable `Conversation.autoReplyAt`, claimed once per thread with a conditional update,
    so two first messages at once still make one greeting.
  - An office setting for the switch, a Nhịp table keyed by office, where no row means on.
    It also keeps when the switch was last turned on, so a thread older than that is never
    greeted (S1).
  - The claim is taken only while the thread has no office message and `autoReplyAt` is
    null, which is what makes it once per thread.
- **Sending.** The greeting goes through the same pipe adapter and `transmit` as an Answer:
  - mock in a mock deployment, with the mock badge;
  - refused for an endpoint that is not connected, so that guest gets no greeting;
  - always inside WhatsApp's 24-hour window.
- **The echo.** The greeting's row stores its vendor message id, as `completeAnswer` does, so
  a pipe that echoes Nhịp's own send back is dropped as a duplicate. An echo stored as an
  app reply would empty Your turn and count as Engaged. An echo that arrives before the row
  is written is the race Answers already have; it is recorded, not fixed.
- **One attempt.** A greeting that fails to send is logged by category, with no guest data,
  and is not retried, so a guest never gets two. The thread then waits as it does today.
- **The model call** is a new adapter method with its own 10 s timeout; translations and
  follow-ups keep 30 s. The guest's text is framed as data (ADR 0005). The cap is the
  greeting's share of #83's per-office cost guard.
- **Counting the cap.** The cap counts this month's model-written auto-replies of the office
  from the message rows: no counter table and no scheduler. A count that is slightly off
  under races, or after a guest deletion (ADR 0020), fits "about 2,000".
- **Go-live doesn't wait on the model.** `DRAFT_*` is unset on staging, prod and in E2E today.
  Until it is set, every greeting is the template. E2E covers the template path. The model
  path is covered by Vitest (the post-check, the cap, the request) and by the G4 test set,
  run by hand.
- **PRODUCT.md and CONTEXT.md change.** "A human approves every message" becomes "every
  message but one". Your turn, Sent, Engaged, In conversation, Response time and Guest
  language are reworded. Auto-reply is a new term.
- **On the lawyer's and A05 lists.**
  - The label and the AI Law classification.
  - The Decree 356 notice, linked from the agency's OA and WhatsApp profile.
  - The model provider, already a named processor.

## Open

- **The label's wording and position.** For the lawyer.
- **The opt-out.** How a guest opts out of automated processing (Decree 356): through the
  agency, by a reply, or not at all. This is for the lawyer.
- **Where the switch lives.** Proposed: the kit's office settings page (Settings → General),
  managers only.
