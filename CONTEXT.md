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

## Integrations

- **Pipe**: a messaging channel the guest uses (WhatsApp, Zalo). One **pipe adapter** per
  pipe owns verify, parse, send window, and send.
- **CRM adapter**: one interface, one implementation per CRM the office uses, plus a mock
  backed by a local table. Source of truth for closings and lost (ADR 0003). Nhịp does not
  become a CRM.
