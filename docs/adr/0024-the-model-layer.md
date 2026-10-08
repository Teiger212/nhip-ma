# 0024. The model layer: one seam, a model per task, and the model writes the suggested reply

Date: 2026-10-08. Status: accepted. Decided by Eyal in the grill of 2026-10-08. Amends ADR 0005
(the suggested reply). Builds on ADR 0007 (translation). Takes over #168's "zero-retention
routing on every model call"; #168 keeps the model greeting. Related: #242, #245, #246, #83.

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
  - A failed call logs the model and an error kind, nothing else.

## Decision

### The model layer (go-live)

- **One seam.** Every model call goes through the draft adapter (`lib/drafts/`), as a named
  task: `draft` and `translate`.
- **A model per task.** Each task takes its model from an env var: `DRAFT_MODEL` and
  `TRANSLATE_MODEL`, each with a documented default.
  - The best-value model changes monthly, so the choice is per task.
  - Switching is an env change and a redeploy. There is no admin UI for it.
- **OpenRouter only, for now.** Other providers are revisited when the product matures.
- **Zero-retention on every request.** Every request sends
  `provider: { zdr: true, data_collection: "deny" }` (openrouter.ai/docs/guides/features/zdr;
  the endpoints that qualify: https://openrouter.ai/api/v1/endpoints/zdr). This supersedes
  #168's "zero-retention routing on every model call". #168 stays open for the model greeting.
- **Per-office daily caps, from env vars.**
  - Drafts: 50 a day. Regenerate counts.
  - Translations: 1,000 a day. This one is abuse protection only.
  - The day resets at midnight Asia/Ho_Chi_Minh.
  - Past a cap, the task falls back (the template, or no translation line) and the event is
    logged.
  - The count lives in our database.
- **Failures.** A call times out after 20 s and is retried once. Then the fallback stands.
  There is no error banner.
- **Logging.** One line per call: task, model, officeId, input and output tokens, latency and
  outcome. Never the message text (PDPL; the scrubber in `modules/shared/lib/scrub.ts`).
- **Later, not built:** an FAQ cache or office brain (#246) in front of this seam.

### The demo slice: the model writes the suggested reply

- **When it drafts.**
  - When a guest message arrives, debounced by about 30 s, because guests send bursts.
  - At once, if the agent opens the thread first.
- **What it reads.**
  - The last 10 messages, the auto-reply included.
  - The extracted guest details and the guest's name.
  - The thread owner's first name and the office's name. When the thread is unassigned, the
    viewer's. If the thread is assigned to someone else before the reply is sent, it is
    drafted again.
  - Whether the office has a human reply yet.
  - The auto-reply's open question.
  - Guest text is wrapped as data, so it can't steer the prompt.
  - No phone numbers and no CRM data.
- **What it returns.** One call returns JSON with both texts: the reply in the guest's
  language, and the same reply in the operator's language (EN or VI).
  - For a guest language Nhịp doesn't support, the draft is in English (#245).
  - An edited reply still goes through the translation model (#242).
- **The rules a draft follows.**
  1. It introduces the agent only when the office has no human reply yet.
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
- **When the guest writes again.**
  - A draft the agent hasn't touched is replaced.
  - An edited one stays, with a quiet "Guest wrote again" note next to Regenerate.
  - The model never overwrites typed text.
- **The label.** "Suggested reply · AI" or "Suggested reply · template".
- **The fallback.** A template with no model, in the agent's own voice. It follows the same
  intro and no-repeat rules (prototype: branch `prototype/thread-layout`,
  `apps/saas/modules/inbox/components/prototype/suggest-reply.prototype.ts`). It replaces
  today's `followUpTemplate` and `draftReply` copy, which repeats the auto-reply and promises
  "a colleague".

### Models

- **Drafting: Haiku 5.5** (`anthropic/claude-haiku-5.5`, $0.10 in and $0.50 out per 1M tokens
  on OpenRouter). It has ZDR endpoints.
- **Translation: decided by an eval.** 50 pairs in VI, JA, KO and RU, taken from the seed
  messages, compare Haiku 5.5 with Gemini 3.1 Flash-Lite (`google/gemini-3.1-flash-lite`,
  $0.25 in and $1.50 out). Eyal reads them side by side. The winner is `TRANSLATE_MODEL`'s
  default.
  - Gemini 3.x bills thinking as output, so its thinking is set to minimal or off.
- **The draft eval.** About 15 seeded walk-office threads: a bare hello, Claire's photos and
  viewing question, Ji-ho after her auto-reply, a later turn, RU, VI, and more.
  - Local checks fail a draft that has a number the guest didn't write, a repeated question,
    an intro on a later turn, or more than 4 sentences.
  - It runs on demand, not in CI, because it costs money. Eyal reads it once.
- **Cost estimate, one office a month.** Translation about $0.65 with Haiku 5.5, or about
  $1.89 with Gemini 3.1 Flash-Lite. Drafting about $0.41.

## Considered options

- **One model for every task (today).** It is simpler, but a better or cheaper model for one
  task means changing all of them.
- **Keep the template suggested reply for the demo.** It repeats the auto-reply and promises a
  colleague, which the 2026-10-08 walk showed reads badly.

## Consequences

- **What this changes in ADR 0005.**
  - "The first reply keeps the template until the model draft proves better": rule 1 covers a
    thread with no human reply yet, so the model drafts first replies too.
  - "For the pilot it is unmetered": drafts and translations are now capped per office and
    day.
  - The fallback template is new copy in the agent's voice.
- **ADR 0007 keeps its decision.** Translation runs through the same seam, as the `translate`
  task, with its own model and cap.
- **ADR 0021's greeting is unchanged.** Its 10 s timeout and its monthly cap of about 2,000
  model greetings belong to #168.
- **Data.** The daily count needs a place in the database. The draft's operator-language text
  needs one too. Both are additive.
- **Testing.** E2E can't call a real model. E2E covers the template path; the model path is
  covered by Vitest with a stubbed adapter, and by the two evals, run by hand.
- **Docs that describe `DRAFT_*` change:** `.env.local.example`, `ARCHITECTURE.md`,
  `HANDOFF.md` and `docs/setup-checklist.md`.

## Open

- **Where the default model ids live.** Today no model id is defaulted in code
  (`config.ts`), and a key without `DRAFT_MODEL` is a startup error. "A documented default"
  could mean a default in code or a value documented for each deployment. Pending Eyal.
- **`TRANSLATE_MODEL`'s default.** Pending the translation eval.
- **Which operator language the draft's second text is in** when the owner and the viewer
  read different languages (EN and VI). Pending Eyal.
- **Rule 4 and the post-check.** Rule 4 has the draft acknowledge a legal question. Today's
  post-check drops any draft with words like visa, ownership or sổ hồng
  (`drafts/guardrails.ts`). Pending Eyal.
- **Two translations per guest message.** A guest message is translated into both operator
  languages, EN and VI (`translate.ts`), so it can cost two calls. Whether the 1,000 cap and
  the cost estimate count one call or two is pending Eyal.
- **The Vietnamese copy** of the template and the labels. Pending a native read (#78).
