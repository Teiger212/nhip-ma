# 0005. The suggested reply is AI-drafted from the conversation, behind the same guardrails

Date: 2026-09-17. Status: accepted. Supersedes the "heuristic drafts only" shortcut.

## Context

The first reply is a template keyed on language and extracted facts. A template cannot
read what the guest just asked, so it cannot draft a second reply that is worth sending.
The reply box exists precisely to hold a suggested answer the agent edits and approves.
"No LLM" was a v1 shortcut to avoid inventing law; it was never the product rule.

## Decision

- The **suggested reply** is drafted by a model from the whole conversation context: every
  guest and office message, the extracted facts, and the operator note. This applies to
  follow-ups first; the first reply keeps the template until the model draft is shown to be
  better on the invented threads.
- The guardrails move from "no model" to rules the model is held to:
  - **Never auto-send.** The draft goes into the reply box; a human approves every send.
  - **Never invent Vietnamese law or promise what a foreigner cannot legally get.** The
    paperwork flag stays a hard rule in the prompt and in a post-check.
  - **Never state a listing fact the office has not provided** (price, availability,
    viewing times). Until the listing match exists, the draft may only acknowledge and
    ask, not answer, on those.
  - **Guest's language, agent's register.** Reply in the guest's language; keep the
    office's tone (short, warm, no sales pressure).
- The model call sits behind a **draft adapter** seam, like pipes and CRM: one interface,
  one implementation per provider, plus the existing template drafter as the fallback when
  the model is unavailable or the office has not enabled it.
- Prefer local heuristics where they are enough (language detection, extraction stay
  regex); use the cheapest model that produces an acceptable follow-up.

## Consequences

- The reply box gets a visible "suggested" state and a way to regenerate.
- Draft quality needs an evaluation set: the invented threads plus a handful of real
  follow-up shapes (viewing request, price question, paperwork question, "thanks").
- A model in the draft path means a prompt-injection surface: guest text is untrusted
  input to the prompt and must be framed as such.
- Cost per draft is a per-office setting later; for the pilot it is unmetered.
