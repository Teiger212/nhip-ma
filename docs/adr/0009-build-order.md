# 0009. Build order: conversation loop, then Home and CRM

Date: 2026-09-17. Status: accepted.

## Context

ADRs 0001 to 0008 imply five pieces of work. They are not independent: the funnel (0002)
counts sends per inbound, which needs per-message approval (0006); the CRM adapter (0003)
needs an office to belong to (0008); translation (0007) and AI drafts (0005) share a
seam.

## Decision

**Next build: the conversation loop.** In this order, one PR, one `/goal`:

1. "Your turn" wording, the quiet section, reply-only per-message approval (ADRs 0004,
   0006). `sentAt` stops being terminal; Approval and Send record the inbound they answer.
2. Guest message translation under each original (ADR 0007), behind the draft adapter,
   stored per message per operator locale.
3. AI follow-up draft from conversation context (ADR 0005), same adapter, template
   fallback, guardrails as written.

**Build after:** office tenancy (0008), Home with the funnel (0001, 0002), the Attio
adapter and mock CRM (0003). Listing match remains the horizon.

## Done line for the next build

> A guest who writes back after an approved send returns to Your turn with their message
> translated under the original and an AI-suggested follow-up in the reply box; the agent
> approves it and it sends; a third approve with no new inbound is 409. Proven by one
> saas test that walks that path and by the same path through the dev server with
> SEND_MODE=mock, both pasted. Lint, type-check, and the full test suite exit 0. No
> auto-send path exists.

## Consequences

- The `/goal` for the next build is this done line plus the constraints in CONTEXT.md and
  ADRs 0005 and 0006, with a 60-turn cap.
- The draft adapter is built once (step 2) and reused (step 3); pick the cheapest model
  that translates VI, JA, KO, RU reliably and produces an acceptable follow-up.
- Home's "connect your CRM" empty state is the first thing the second build ships, so the
  screen exists before the numbers do.
