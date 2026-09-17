# Context

The domain language for Nhịp. One definition per term. Decisions with a reason live in
`docs/adr/`. When a word here and a word in code disagree, this file wins and the code
is renamed.

## Product

- **Nhịp**: a speed-to-lead product for high-end apartments in Vietnam. Turns an inbound
  lead on WhatsApp or Zalo into a human-approved reply in the guest's language, at any
  hour, with the agency's own number.
- **Language bridge**: the durable value. Agents who work in Vietnamese and some English
  serve multinational guests (JA, KO, RU, EN today) without a translator in the loop.
- **Listing match**: the horizon. Searching the office's own pool of properties against
  what the guest said, so the reply carries the best few matches. Not built.

## People

- **Guest**: the person who wrote in. A prospective tenant or buyer, or someone writing
  on their behalf (HR, a relocation firm). Never sees Nhịp; sees the agency number.
- **Agent**: the person who answers guests. The **user** of the queue. Works mostly in
  Vietnamese, some English, on a phone.
- **Manager**: the office manager or agency owner. The **customer**: pays for faster
  responses and fewer lost multinational leads. Reads Home.
- **Operator**: any signed-in person, agent or manager. Used in code and copy where the
  role does not matter ("Operator note", "Your turn").

## Surfaces

- **Inbox**: the agent's screen. A **queue**, not a mailbox: the default view is what
  waits on the operator, oldest waiting guest first.

## Queue

- **Your turn**: the guest spoke last. The only pending state. A fact, not a judgment.
- **Quiet**: a Your-turn thread the guest last touched more than 48 hours ago. Collapsed
  at the bottom of the queue, still Your turn.
- **Sent**: the office spoke last.
- **Resolved**: the CRM reports won or lost. Leaves the queue; visible under Sent / All.
- There is no dismiss. The queue empties through sends and outcomes (ADR 0004).
- **Home**: the numbers screen. Widgets made of graphs, visible to every operator, not
  gated by role. Office-level only. The headline is the **funnel** (ADR 0002); response
  time is a supporting widget. No per-agent breakdown (future feature).

## Funnel

- **Lead**: a guest who wrote in. One per conversation.
- **Engaged**: a lead who received at least one approved send.
- **In conversation**: a lead with more than one exchange (a guest message after an
  approved send).
- **Closing**: a lead that became a signed lease or a completed sale. Known only through
  the CRM adapter, never inferred from chat.
- **Lost**: a lead the office marked lost in its CRM, with reason where known.
- **Response time**: first inbound to first approved send. Supporting metric.

## Drafting

- **One-shot**: the deterministic pass on a new inbound: language detection, extraction
  (Qualification), first-reply template, operator note. Regex and templates.
- **Suggested reply**: the text in the reply box. For a first reply, the template. For a
  follow-up, an AI draft from the whole conversation (ADR 0005). Always editable, never
  sent without Approve and send.
- **Draft adapter**: one interface, one implementation per model provider, with the
  template drafter as fallback.
- **Operator note**: the agent-language summary of facts and flags. Not shown to the
  guest. Never invents Vietnamese law.

## Integrations

- **Pipe**: a messaging channel the guest uses (WhatsApp, Zalo). One **pipe adapter** per
  pipe owns verify, parse, send window, and send.
- **CRM adapter**: one interface, one implementation per CRM the office uses, plus a mock
  backed by a local table. Source of truth for closings and lost (ADR 0003). Nhịp does not
  become a CRM. First real adapter: **Attio** (provisional).
- **CRM link**: the stored association between a conversation and a CRM lead. Made
  automatically by phone number (E.164), or by the agent through "link to CRM lead".
