# 0024. The model layer: one seam, a model per task, and the model writes the suggested reply

Date: 2026-10-08. Status: accepted. Decided by Eyal in the grill of 2026-10-08, and his answers
to its open points the same day. Amends ADR 0005 (the suggested reply), ADR 0011 (an edit kept
after the guest wrote again), and ADR 0021 (the 30 s for translations and follow-ups, and P2's
model draft after the greeting). Builds on ADR 0007 (translation) and ADR 0025 (the office
language). Takes over #168's "zero-retention routing on every model call"; #168 keeps the model
greeting. Related: #242, #245, #246, #83.

## Context

- **One adapter already exists.** Translation and follow-up drafts go through the draft
  adapter (`apps/saas/modules/inbox/lib/drafts/`, ADRs 0005, 0007). It is one
  OpenAI-compatible client, OpenRouter by default, with one model for everything
  (`DRAFT_MODEL`).
- **The model is off everywhere.** `DRAFT_*` is unset on staging, prod and in E2E. Every
  suggested reply is a template, and nothing is translated.
- **The templates read badly in the demo** (walk of 2026-10-08). After the auto-reply, the
  follow-up template thanks the guest again and promises "a colleague", when the agent
  sending it is that colleague (`draft.ts`, `followUpTemplate`).
- **The best-value model changes every month.** One model for every task means a switch for
  one task is a switch for all of them.
- **What the code does today, which this ADR changes:**
  - No request carries zero-retention routing (`drafts/openai-compatible.ts`). ADR 0021 (P3)
    decided it; #168 was to build it.
  - A request times out after 30 s and is not retried.
  - Nothing caps an office's model use. ADR 0005 left the pilot unmetered.
  - No model id is defaulted in code, and a key without `DRAFT_MODEL` is a startup error
    (`config.ts`).
  - `DRAFT_BASE_URL` accepts any OpenAI-compatible endpoint.
  - A failed call logs the model and an HTTP status or error kind. A success, and a reply
    the provider filtered, log nothing.
  - After the auto-reply, the model drafts the first human reply (ADR 0021, P2).
  - The post-check drops any draft that mentions paperwork words such as visa, ownership or
    sổ hồng (`drafts/guardrails.ts`).
  - The reply box keeps an edit only for the guest message it was typed for, and a send for
    an older guest message is refused with `409 stale_target` (ADR 0011).

## Decision

### The model layer (go-live)

- **One seam.** Every model call goes through the draft adapter (`lib/drafts/`), as a named
  task: `draft` and `translate`.
- **A model per task, defaulted in code.**
  - `DRAFT_MODEL` defaults to `anthropic/claude-haiku-5.5`.
  - `TRANSLATE_MODEL` defaults to `anthropic/claude-haiku-5.5` until the translation eval
    picks its model.
  - An env var overrides either default. A key alone is enough to start.
  - The best-value model changes monthly, so the choice is per task. Switching is an env
    change and a redeploy. There is no admin UI for it.
- **OpenRouter is the only provider.** OpenRouter with zero-retention routing is the only
  production provider. The base URL may stay configurable for development. Another provider
  is discussed if that ever changes.
- **Zero-retention on every request.** Every request sends
  `provider: { zdr: true, data_collection: "deny" }` (openrouter.ai/docs/guides/features/zdr;
  the endpoints that qualify: https://openrouter.ai/api/v1/endpoints/zdr). This supersedes
  #168's "zero-retention routing on every model call". #168 stays open for the model greeting.
- **Per-office daily caps, from env vars.** Each cap counts model calls.
  - Drafts: 50 a day. Regenerate counts.
  - Translations: 1,000 a day. This one is abuse protection only. With one office language
    (ADR 0025), a guest message costs one call, so the cap is about 1,000 messages. Eyal
    expects 600 to 800 at most.
  - The day resets at midnight Asia/Ho_Chi_Minh.
  - Past a cap, the task falls back (the template, or no translation line) and the event is
    logged.
  - The count lives in our database.
- **Failures.** A call times out after 20 s and is retried once. Then the fallback stands.
  There is no error banner.
- **Logging.** One line per call: task, model, officeId, input and output tokens, latency and
  outcome. Never the message text (PDPL; the scrubber in `modules/shared/lib/scrub.ts`).
- **Testing.** E2E runs against a deterministic stub model. It is refused in production, as
  the mock CRM's webhook secret is.
- **Later, not built:** an FAQ cache or office brain (#246) in front of this seam.

### The demo slice: the model writes the suggested reply

- **First replies keep the template.** ADR 0005's "first reply keeps the template" stands. The
  model drafts only the replies after the office's first human reply. Until then, including
  after the auto-reply, the reply box holds the template.
- **When the model drafts.**
  - When a guest message arrives, debounced by about 30 s, because guests send bursts.
  - At once, if the agent opens the thread first.
- **What it reads.**
  - The last 10 messages, the auto-reply included.
  - The extracted guest details and the guest's name.
  - The auto-reply's open question.
  - Guest text is wrapped as data, so it can't steer the prompt.
  - No phone numbers and no CRM data.
- **What it returns.** One call returns JSON with both texts: the reply in the guest's
  language, and the same reply in the office language (ADR 0025).
  - For a guest language Nhịp doesn't support, the draft is in English (#245).
  - An edited reply still goes through the translation model (#242).
- **The rules a draft follows.**
  1. The intro of the agent lives in the template only, which introduces the agent when the
     office has no human reply yet. The model draft never introduces anyone.
  2. It picks out the guest's key points. A bare "hello" with none gets one open question
     (what are they looking for), unless the auto-reply already asked it.
  3. It promises actions and never claims stock: "I'll pull together a few options in Tây Hồ
     around $2,800", not "I have…".
  4. It acknowledges every question the guest asked. Prices, fees, legal answers,
     availability and viewing times are deferred to the agent and never stated.
  5. It never repeats a question the office already asked that the guest hasn't answered. It
     asks for another missing detail only if that detail changes what the agent would send.
  6. It is 2 to 4 short sentences, in chat register and the guest's formality (VI: anh/chị),
     with no sign-off and no placeholders like "[time]".
- **The post-check blocks answers, not mentions.** It blocks a stated answer (a price, an
  availability, a viewing time, a legal answer) and a number the guest didn't write. A mention
  passes: "I'll check the ownership rules for you" is fine.
- **When the guest writes again.**
  - A draft the agent hasn't touched is replaced.
  - An edited one stays, with a quiet "Guest wrote again" note next to Regenerate.
  - The model never overwrites typed text.
  - The agent can just send the kept edit. The send is recorded as answering the latest guest
    message, with no `409 stale_target`.
- **The label.** "Suggested reply · AI" or "Suggested reply · template".
- **The template.** A reply with no model, in the agent's own voice. It replaces today's
  `followUpTemplate` and `draftReply` copy, which repeats the auto-reply and promises
  "a colleague" (prototype: branch `prototype/thread-layout`,
  `apps/saas/modules/inbox/components/prototype/suggest-reply.prototype.ts`).
  - It is the first reply, and the fallback for every later one.
  - It introduces the agent (the thread owner's name guests see, #266, and the office) only
    when the office has no human reply yet.
  - On an unassigned thread it names the office only, and so it does when the owner hasn't set
    a name guests see (pending Eyal's nod, #266). Once the thread is assigned, it is
    written again with the owner's name. Only the template names anyone, so this rule is the
    template's alone.
  - It follows the model's no-repeat rule.

### Models

- **Drafting: Haiku 5.5** (`anthropic/claude-haiku-5.5`, $0.10 in and $0.50 out per 1M tokens
  on OpenRouter). It has ZDR endpoints.
- **Translation: decided by an eval.** All 62 seed pairs in VI, JA, KO and RU compare Haiku 5.5
  with Gemini 3.1 Flash-Lite (`google/gemini-3.1-flash-lite`, $0.25 in and $1.50 out). The
  seed holds 41 such guest messages; JA, KO and RU go into both EN and VI. Eyal reads them
  side by side. The winner replaces Haiku 5.5 as `TRANSLATE_MODEL`'s default, if it differs.
  - Gemini 3.x bills thinking as output, so its thinking is set to minimal or off.
- **The draft eval.** About 15 seeded walk-office threads: a bare hello, Claire's photos and
  viewing question, Ji-ho after her auto-reply, a later turn, RU, VI, and more.
  - Local checks fail a draft that has a number the guest didn't write, a repeated question,
    an intro, or more than 4 sentences.
  - It runs on demand, not in CI, because it costs money. Eyal reads it once.
- **Cost estimate, one office a month.** Translation about $0.65 with Haiku 5.5, or about
  $1.89 with Gemini 3.1 Flash-Lite. Drafting about $0.41.

## Considered options

- **One model for every task (today).** It is simpler, but a better or cheaper model for one
  task means changing all of them.
- **Keep the template suggested reply for the demo.** It repeats the auto-reply and promises a
  colleague, which the 2026-10-08 walk showed reads badly.
- **The model drafts first replies too.** Rejected: the first reply keeps the template, which
  introduces the agent.
- **A kept edit refused after the guest wrote again (`409`, as today).** Rejected: the note is
  visible, so the agent sends knowingly.

## Consequences

- **What this changes in ADR 0005.**
  - "For the pilot it is unmetered": drafts and translations are now capped per office and
    day.
  - The template is new copy in the agent's voice.
  - "The first reply keeps the template" stands.
- **What this changes in ADR 0011.**
  - The reply box keyed the edit by the guest message, so a new message emptied it. Now an
    edited reply stays when the guest writes again.
  - The stale-target rule gets one exception: the kept edit is sent as the answer to the
    latest guest message, with no `409`.
- **What this changes in ADR 0021.**
  - Translations and follow-ups time out after 20 s, with one retry, not 30 s.
  - P2's model draft after the greeting: a greeted thread with no human reply yet holds the
    template, not a model draft.
  - The greeting is otherwise unchanged. Its 10 s timeout and its monthly cap of about 2,000
    model greetings belong to #168.
- **ADR 0007 is amended by ADR 0025.** A guest message is translated once, into the office
  language. Translation runs through this seam as the `translate` task, with its own model
  and cap.
- **Data.** The daily count needs a place in the database. The draft's office-language text
  needs one too. Both are additive.
- **Docs that describe `DRAFT_*` change:** `.env.local.example`, `ARCHITECTURE.md`,
  `HANDOFF.md` and `docs/setup-checklist.md` (its staging steps and its production env list).

## Open

- **The Vietnamese copy** of the template and the labels. Pending a native read (#78).
- **`TRANSLATE_MODEL`'s final default.** Haiku 5.5 until Eyal reads the translation eval.
