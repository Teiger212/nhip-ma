# Nhịp

Working name only (pulse of the first reply). Not a brand lock. Terms are defined once in
[CONTEXT.md](./CONTEXT.md); decisions and their reasons are in [docs/adr](./docs/adr).

## What it is

A speed-to-lead product for high-end apartments in Vietnam. A lead writes an agency on
WhatsApp or Zalo, often in Japanese, Korean, Russian, or English. Nhịp turns that inbound
into a reply in the guest's language within minutes, at any hour, and a human agent
approves every message before it goes out. The guest only ever sees the agency's own
number.

The wedge is the first reply. The durable value is the **language bridge**, and it runs
both ways: every guest message is translated for the agent, every reply is drafted for
the guest. The horizon is **listing match**: the office's own pool of properties,
searched against what the guest said, so the agent sends the best few instead of "a
colleague will be in touch".

## Who

- **Agent**: the user. Lives in the Inbox.
- **Manager**: the customer. Reads Home.
- **Office**: the tenant; threads are shared inside it.

Full definitions are in CONTEXT.md. Not mass-market brokerage. Not a rental operator. Not
a marketplace.

## The job, in order

1. **Capture.** Every inbound on the office's WhatsApp or Zalo number lands in one inbox.
2. **Understand.** Detect the language, translate the message into the agent's language
   under the original, extract what the guest already said (area, rent or buy,
   timeframe, budget, household, nationality, in Vietnam now, paperwork raised).
3. **Draft.** A suggested reply in the guest's language in the reply box, plus an
   **operator note** in the agent's language with the facts and flags. The first reply is
   a template today; follow-ups are AI-drafted from the whole conversation. Neither ever
   invents Vietnamese law or states a listing fact the office has not provided.
4. **Queue.** The inbox is a queue, oldest waiting guest first. A thread is **Your turn**
   when the guest spoke last; whether to reply is the agent's call. Threads untouched for
   48 hours drop into a quiet section. There is no dismiss.
5. **Approve.** The agent edits if needed and taps **Approve and send**. Every send
   answers exactly one guest message, and nothing is sent without a human approving that
   message. No nudges yet.
6. **Send.** On the same pipe the guest used, from the agency's number.
7. **Follow up.** When the guest writes back, the thread returns to Your turn with a
   translated message and a follow-up draft that does not re-greet them.
8. **Count.** Home shows the office funnel: leads in, engaged, in conversation, closings,
   lost, with response time underneath. Closings and lost come from the office's CRM.
   Same numbers for every operator; no per-agent breakdown yet.

## Integrations

- **Pipes**: WhatsApp Cloud API, Zalo OA. One adapter each.
- **CRM**: one adapter per system; Attio first (provisional), a mock for offices without
  one. Guests match to CRM leads by phone number, or by the agent linking once. Nhịp
  reads outcomes; it does not become the CRM.
- **Drafting**: one adapter per model provider, with the template drafter as fallback.

## Build order

1. **Conversation loop** (next): Your turn and per-message approval, then translation,
   then AI follow-ups. Done line in ADR 0009.
2. **Office and Home**: office tenancy, the funnel, the Attio and mock CRM adapters.
3. **Listing match**: depends on a listings source the office already keeps.

## Deliberately not

Not a guest-facing bot. Not legal advice. Not a CRM. Not a listings database. Not a
marketplace or rental operator. Not a per-agent performance tool, yet. Full list with
reasons in CONTEXT.md.
