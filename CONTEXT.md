# Context

The domain language for Nhịp. One definition per term. Decisions with a reason live in
`docs/adr/`. When a word here and a word in code disagree, this file wins and the code
is renamed.

## Product

- **Nhịp**: a speed-to-lead product for high-end apartments in Vietnam. Turns an inbound
  lead on WhatsApp or Zalo into a human-approved reply in the guest's language, at any
  hour, from the agency's own number.
- **Language bridge**: the durable value. Agents who work in Vietnamese and some English
  serve multinational guests (JA, KO, RU, EN today) without a translator in the loop.
  Two-way: every guest message is translated into the operator's language (ADR 0007),
  and every reply is drafted in the guest's language.
- **Listing match**: the horizon. The office's own pool of properties searched against
  what the guest said, so the reply carries the best few matches. Not built.

## People

- **Guest**: the person who wrote in. A prospective tenant or buyer, or someone writing
  on their behalf (HR, a relocation firm). Never sees Nhịp; sees the agency number.
- **Agent**: the person who answers guests. The **user** of the queue. Works mostly in
  Vietnamese, some English, on a phone and at a desk about equally. Sees the office's pool and the threads they own
  (ADR 0015).
- **Manager**: the office manager or agency owner. The **customer**: pays for faster
  responses and fewer lost multinational leads. Reads Home, sees every thread in the
  office, reassigns owners, and invites the office's agents (ADR 0015). An office may have
  several. (In the kit: a member with the role `owner` or `admin`; an agent is `member`.)
  _Avoid_: admin, office admin (admin means the platform admin only).
- **Platform admin**: Nhịp's own staff. Creates offices, connects each office's pipes and
  invites each office's first manager; never an operator: the membership the kit gives the
  office's creator opens no guests' threads, no Inbox or Home, and is not a seat (ADR 0015).
- **Operator**: any signed-in person, agent or manager. Used in code and copy where the
  role does not matter ("Operator note", "Your turn"). Exists only inside an office: when
  the membership ends, the account ends, except the platform admin's (ADR 0013).
- **Office**: the tenant (ADR 0008). Owns its pipes, CRM connection, agents, and threads.
  A thread starts in the office's pool and belongs to its owner once answered (ADR 0015).
  One agency, one office is the MVP; multi-office agencies later. Every office lives in
  one shared Nhịp, yet each feels standalone: its own address (a subdomain), its own name,
  and no sign that other offices exist.
- **Office setup**: the platform admin's single step that creates an office and invites
  its first manager. Operators never create, switch or leave offices.

## Surfaces

- **Inbox**: the agent's screen, and where every operator lands. A **queue**, not a
  mailbox: the default view is what waits on the operator, oldest waiting guest first.
- **Admin area**: the platform admin's screens, and the only ones they see: offices, each
  office's pipe connections and status, and its members. Where the platform admin lands.

## Queue

- **Your turn**: the guest spoke last (there is an unanswered inbound). The only pending
  state. A fact, not a judgment.
- **Quiet**: a Your-turn thread the guest last touched more than 48 hours ago. Collapsed
  at the bottom of the queue, still Your turn.
- **Sent**: the office spoke last.
- **Pool**: the office's threads no agent owns yet. Every agent in the office sees them,
  so a new guest is answered by whoever is available (ADR 0015). An agent's Inbox is the
  pool and their own threads, labelled "Pool" and "Yours"; a colleague's threads do not
  exist for them (not listed, counted, searched or opened). Home stays office-level.
- **Owner**: the operator who approved a thread's first reply in Nhịp: the thread is **claimed**
  at that approval, even if the send then fails. From then on it is in that operator's queue
  only (and every manager's). A reply sent from the WhatsApp or Zalo app itself claims
  nothing. When the owner's account ends (ADR 0013), the thread returns to the pool.
- **Reassign**: a manager gives a thread to another operator of the office, or back to the
  pool. Only managers reassign; agents never hand threads on.
- **Resolved**: the CRM reports won or lost. Leaves the queue (and the nav count) until the guest
  writes again after Nhịp first saw that outcome, not the CRM's own close date; visible under
  Sent / All with a neutral Won or Lost in place of the turn (ADR 0003).
- There is no dismiss. The queue empties through sends and outcomes (ADR 0004).
- **Home**: the numbers screen. Widgets made of graphs, visible to every operator, not
  gated by role. Office-level only. The headline is the **funnel** (ADR 0002); response
  time is a supporting widget. No per-agent breakdown (future feature).

## Funnel

- **Lead**: a guest who wrote in. One per conversation.
- **Engaged**: a lead who received at least one office reply: an approved send, or a reply
  an agent sent from the WhatsApp or Zalo app itself. Mock sends count only in a mock
  deployment.
- **In conversation**: a lead with more than one exchange (a guest message after the
  office's first reply).
- **Closing**: a lead that became a signed lease or a completed sale. Known only through
  the CRM adapter, never inferred from chat.
- **Lost**: a lead the office marked lost in its CRM, with reason where known.
- **Response time**: first inbound to the office's first reply (the first `sent` Answer's
  `sentAt`, or the first reply from the vendor's app, whichever came first). Supporting metric: median and 90th percentile over the answered leads.
- **Window**: Home counts the leads whose first message landed in the last 30 days, and
  engaged and in conversation inside that cohort, so the funnel never widens. The 30 days
  are the office's local calendar days, today included, so leads by day has one bar per day.

## Sending

- **Approve and send**: the single send action: a human approving one suggested reply for
  one inbound message. Never automatic.
- **Reply-only**: every send answers exactly one guest message; one send per inbound; no
  unprompted sends (nudges deferred, ADR 0006).
- **Answer**: the record of one send, the office's reply to exactly one guest message,
  on file from the moment the operator approves it and through `sending`, `sent`,
  `failed` or `unknown` (ADR 0011). One per inbound. Keeps the sender's name after the
  sender's account is gone (ADR 0013).
- **Live send**: a send that reaches the vendor. Happens only when the deployment is live
  and the thread's endpoint has a connected pipe connection. A **mock send** reaches no one:
  every send in a mock deployment (dev, previews), and demo threads. A live deployment
  refuses a send from an endpoint that is not connected rather than mock it.
- **SEND_MODE**: the deployment-wide switch: `mock` (never a live send; dev) or exactly
  `live` (staging and prod).

## Drafting

- **One-shot**: the deterministic pass on a new inbound: language detection, extraction
  (Qualification), first-reply template, operator note. Regex and templates.
- **Suggested reply**: the text in the reply box. For a first reply, the template. For a
  follow-up, an AI draft from the whole conversation (ADR 0005). Always editable, never
  sent without Approve and send.
- **Draft adapter**: one interface, one implementation per model provider, with the
  template drafter as fallback.
- **Operator note**: the agent-language summary of facts and flags. Not shown to the
  guest, never invents Vietnamese law, and is not a translation.
- **Translation**: the guest message rendered in the operator's language, shown under the
  original. Stored per message per operator locale (ADR 0007).
- **Operator language**: EN or VI, from the operator's locale setting. The target for
  translations and the language of the operator note.
- **Guest language**: detected per conversation; EN, VI, JA, KO, RU are first-class.

## Integrations

- **Pipe**: a messaging channel the guest uses (WhatsApp, Zalo). One **pipe adapter** per
  pipe owns verify, parse, send window, and send.
- **Pipe connection**: an office's link to one of its own endpoints on a pipe: a WhatsApp
  number or a Zalo OA. Made by the platform admin in the admin area, with the agency person
  who owns that number or OA present to approve it on the vendor's screen. Inbound on the
  endpoint files to the office; replies go out from it. An endpoint belongs to one office
  at a time. **Disconnecting** it (platform admin) ends sending and stops filing new
  messages to the office; its threads stay, read-only on that pipe.
- **Disconnected**: a pipe connection that can no longer send (its vendor authorization
  lapsed or was revoked). Guests' messages still arrive; replies that would go out from it
  are blocked with the reason shown, and the platform admin is alerted to reconnect it with
  the owner. The office's other numbers and OAs are unaffected.
- **CRM adapter**: one interface, one implementation per CRM the office uses. Source of truth
  for closings and lost (ADR 0003). Nhịp does not become a CRM. The only CRM so far is the
  **mock CRM**, which keeps its leads in Nhịp's database; HubSpot's free CRM is decided as the
  first real one (ADR 0003, spec #59).
- **CRM lead**: the guest's record in the office's CRM (a contact with its deal). Not the
  funnel's **Lead**, which is a guest who wrote in.
- **CRM link**: the stored association between a thread and its CRM lead. Nhịp makes it when a
  guest writes on a thread that has none: it finds the guest's CRM lead (by phone on WhatsApp,
  by the Zalo user id Nhịp stored on Zalo) or creates one. A guest who matches two CRM leads is
  linked to neither. The thread header shows the CRM lead, read-only.

## Deliberately not

Nhịp is not, and is not becoming, any of these; recorded so they do not creep in.

- **Not a guest-facing bot.** Guests talk to the agency; every message they receive was
  approved by a human.
- **Not legal advice.** Paperwork is flagged to the agent, never explained to the guest.
- **Not a CRM.** It links to the office's CRM through an adapter and never becomes the
  record of deals.
- **Not a listings database.** Listing match reads from a pool the office already keeps;
  Nhịp does not scrape or maintain listings.
- **Not a marketplace or a rental operator.** No guest-side accounts, no bookings, no
  payments between guest and agency.
- **Not a per-agent performance tool** in this version. Office numbers only.
- **Not mass-market brokerage.** High-end apartments, multinational guests.
