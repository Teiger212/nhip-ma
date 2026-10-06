# Context

The domain language for Nhịp. One definition per term. Decisions with a reason live in
`docs/adr/`. When a word here and a word in code disagree, this file wins and the code
is renamed.

## Product

- **Nhịp**: a speed-to-lead product for high-end apartments in Vietnam. Greets a new lead on
  WhatsApp or Zalo within seconds with one labelled auto-reply (ADR 0021). It then turns each
  of the guest's messages into a human-approved reply in the guest's language, at any hour,
  from the agency's own number.
- **Language bridge**: the durable value. Agents who work in Vietnamese and some English
  serve multinational guests (JA, KO, RU, EN today) without a translator in the loop.
  Two-way: every guest message is translated into the operator's language (ADR 0007),
  and every reply is drafted in the guest's language.
- **Listing match**: the horizon. The office's own pool of properties searched against
  what the guest said, so the reply carries the best few matches. Not built.

## People

- **Guest**: the person who wrote in. A prospective tenant or buyer, or someone writing
  on their behalf (HR, a relocation firm). Never sees Nhịp; sees the agency number. Often an
  expat on a foreign number: a WhatsApp number is always read with its country code; full
  international input comes after go-live (#125).
- **Agent**: the person who answers guests. The **user** of the queue. Works mostly in
  Vietnamese, some English, on a phone and at a desk about equally. Sees only the threads a
  manager assigned to them (ADR 0022).
- **Manager**: the office manager or agency owner. The **customer**: pays for faster
  responses and fewer lost multinational leads. Reads Home, sees every thread in the
  office, assigns every new lead and reassigns owners (ADR 0022), turns the office's
  auto-reply off or on (ADR 0021), invites the office's agents (ADR 0015), and deletes a guest's data
  on request (ADR 0020). An office may have
  several. (In the kit: a member with the role `owner` or `admin`; an agent is `member`.)
  _Avoid_: admin, office admin (admin means the platform admin only).
- **Platform admin**: Nhịp's own staff. Creates offices, connects each office's pipes and
  invites each office's first manager; never an operator: the membership the kit gives the
  office's creator opens no guests' threads, no Inbox or Home, and is not a seat (ADR 0015).
- **Operator**: any signed-in person, agent or manager. Used in code and copy where the
  role does not matter ("Operator note", "Your turn"). Exists only inside an office: when
  the membership ends, the account ends, except the platform admin's (ADR 0013).
- **Office**: the tenant (ADR 0008). Owns its pipes, its CRM connection if any, its agents, and
  its threads.
  A thread starts Unassigned and belongs to the operator a manager assigns it to (ADR 0022).
  One agency, one office is the MVP; multi-office agencies later. Every office lives in
  one shared Nhịp, yet each feels standalone: its own address (a subdomain), its own name,
  and no sign that other offices exist.
- **Intake**: what Nhịp asks a new agency before setting anything up: which CRM it already
  uses, its Zalo OA and WhatsApp number, its people, its guests (#128). The answer picks the
  agency's CRM path.
- **Office setup**: the platform admin's single step that creates an office and invites
  its first manager. Operators never create, switch or leave offices.

## Surfaces

- **Inbox**: the agent's screen, and where every operator lands. A **queue**, not a
  mailbox: the default view is what waits on the operator, oldest waiting guest first.
  Nhịp installs as an app that opens on it, and it asks, never on its own, to turn alerts on
  for the device (ADR 0019).
- **Admin area**: the platform admin's screens, and the only ones they see: offices, each
  office's pipe connections and status, and its members. Where the platform admin lands.

## Queue

- **Your turn**: the guest's latest message has no human reply yet (there is an unanswered
  inbound). The auto-reply is not a reply (ADR 0021). The only pending state. A fact, not a
  judgment.
- **Quiet**: a Your-turn thread the guest last touched more than 48 hours ago. Collapsed
  at the bottom of the queue, still Your turn.
- **Sent**: the guest's latest message has a human reply.
- **Unassigned**: the office's threads no operator owns yet: every new lead, until a manager
  assigns it (ADR 0022). Only managers see them: the Inbox's Unassigned view comes first,
  and a manager's Waiting now lists them first. An agent's Inbox is only their own threads;
  Unassigned and colleagues' threads don't exist for them (not listed, counted, searched or
  opened). Home stays office-level. _Avoid_: pool.
- **Owner**: the operator a manager assigned the thread to (ADR 0022). From then on it is in
  that operator's queue only (and every manager's). A manager who approves a reply on an
  Unassigned thread **claims** it at that approval and can reassign it at any time (ADR 0022).
  A reply sent from the WhatsApp
  or Zalo app itself, or the auto-reply, claims nothing. When the owner's account ends (ADR
  0013), the thread returns to Unassigned.
- **Assign**: a manager gives an Unassigned thread to an operator of the office ("Assign
  to…"). **Reassign**: gives an owned thread to another operator, or back to Unassigned. Any
  manager, at any time; the last assignment wins. Agents never hand threads on (ADR 0022).
  The operator who loses the thread gets a bell row naming the guest ("Minji Kim was moved to
  another agent"), with no push.
- **Resolved**: the CRM reports won or lost. Leaves the queue (and the nav count) until the guest
  writes again after Nhịp first saw that outcome, not the CRM's own close date; visible under
  Sent / All with a neutral Won or Lost in place of the turn (ADR 0003).
- There is no dismiss. The queue empties through sends and outcomes (ADR 0004).
- **Home**: the numbers screen. Widgets made of graphs, visible to every operator, not
  gated by role. Office-level only. The headline is the **funnel** (ADR 0002); response
  time is a supporting widget. No per-agent breakdown (future feature).

## Alerts

- **Alert**: a web push telling an operator a guest is waiting (ADR 0019). It goes to the
  operators who can open the thread: an Unassigned guest alerts the office's managers; an
  owned thread's guest alerts its owner only (ADR 0022). An assignment alerts the operator
  given the thread, with a bell row that names no guest ("A manager gave you a thread"); a
  thread returned to Unassigned alerts the managers. Whoever acts is never alerted for
  their own action, and the platform admin is never alerted. It says the guest's name ("A
  guest" when there is none), pipe and language in the operator's language, never the
  message, and nothing that identifies the thread. One per thread: a new one replaces the
  last and sounds again only after 2 minutes of quiet. Only a message Nhịp had not stored
  before alerts; a vendor's retry does not. In a mock deployment alerts are decided and
  logged, and never pushed. _Avoid_: notification (the kit's bell row).
- **Device**: a browser or installed app on which an operator turned alerts on. Every device
  gets every alert until the operator signs out on it, the account ends, or its push service
  says it is gone. An operator keeps at most 10; a phone that changes hands moves to whoever
  turns alerts on there next, from that same browser (knowing a device's address is not
  enough to take it).

## Funnel

- **Lead**: a guest who wrote in. One per conversation. A deleted guest's lead still counts,
  through its lead tally (ADR 0020).
- **Engaged**: a lead who received at least one human reply: an approved send, or a reply
  an agent sent from the WhatsApp or Zalo app itself. The auto-reply doesn't count (ADR
  0021). Mock sends count only in a mock deployment.
- **In conversation**: a lead with more than one exchange (a guest message after the
  office's first human reply).
- **Closing**: a lead that became a signed lease or a completed sale. Known only through
  the CRM adapter, never inferred from chat.
- **Lost**: a lead the office marked lost in its CRM, with reason where known.
- **Response time**: first inbound to the office's first human reply; never the auto-reply (the first `sent` Answer's
  `sentAt`, or the first reply from the vendor's app, whichever came first). Supporting metric: median and 90th percentile over the answered leads.
- **Window**: Home counts the leads whose first message landed in the last 30 days, and
  engaged and in conversation inside that cohort, so the funnel never widens. The 30 days
  are the office's local calendar days, today included, so leads by day has one bar per day.

## Sending

- **Approve and send**: the single send action: a human approving one suggested reply for
  one inbound message. Never automatic.
- **Reply-only**: every approved send answers exactly one guest message; one send per
  inbound. Nothing else is sent, except the auto-reply (nudges deferred, ADR 0006).
- **Auto-reply**: the one message Nhịp sends on its own (ADR 0021).
  - **When:** an answer to a new guest's first message, sent within seconds without an
    approval. At most one per thread. On by default; a manager can turn it off for the office.
  - **What:** it thanks the guest, acknowledges what they gave, and asks for at most two
    missing details. It never gives prices, availability, listings, legal matters, promises
    or times.
  - **Who writes it:** the model, within a post-check. The fixed template stands in when the
    model is off, slow (about 10 s) or over the office's monthly cap, or when its text fails
    the post-check. A language that can't be greeted gets the English template.
  - **Only new threads:** turning it on later never greets a thread that began while it was
    off.
  - **The label:** an always-on line naming the office ("Auto-reply from Saigon Prime: a
    colleague will continue with you right here"). It is proposed as the last line, pending
    the lawyer.
  - **What it isn't:** not an Answer. It claims nothing, leaves the thread Your turn, and
    counts nowhere in the funnel.
  - **In the thread:** an "Auto-reply" badge, with "Model" or "Template".
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
  (Qualification), first-reply template, operator note. Regex and templates. The
  auto-reply's fallback template is built from it too (ADR 0021).
- **Suggested reply**: the text in the reply box. For a first reply in an office with the
  auto-reply off, the template. Once the auto-reply is sent, and for every follow-up, an AI
  draft from the whole conversation, written knowing the greeting went out, so it never
  greets twice; with no model, the follow-up template (ADR 0005, ADR 0021). Always editable,
  never sent without Approve and send.
- **Draft adapter**: one interface, one implementation per model provider, with the
  template drafter as fallback.
- **Operator note**: the agent-language summary of facts and flags. Not shown to the
  guest, never invents Vietnamese law, and is not a translation.
- **Translation**: the guest message rendered in the operator's language, shown under the
  original. Stored per message per operator locale (ADR 0007).
- **Operator language**: EN or VI, from the operator's locale setting. The target for
  translations and the language of the operator note.
- **Guest language**: detected per conversation; EN, VI, JA, KO, RU are first-class. Any
  other language reads as EN. VI is read only from letters Vietnamese alone uses (ă, â, đ, ơ,
  ư, a hook above or a dot below, ẽ ĩ ũ ỹ, any tone on ă â ê ô ơ ư) or its common words, so
  French, Spanish and Portuguese read as EN (ADR 0021). An unsupported language is greeted in
  English, and its translation is from English.

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
  are blocked with the reason shown, and the platform admin gets a bell row to reconnect it
  with the owner (ADR 0017), not an alert. The office's other numbers and OAs are unaffected.
- **CRM adapter**: one interface, one implementation per CRM the office uses. Source of truth
  for closings and lost (ADR 0003). The office connects the CRM it already uses; Nhịp never
  sets one up for it, and an office with no CRM has no connection and no won or lost. The
  adapters are the **mock CRM**, which keeps its leads in Nhịp's database and is for
  development and demos only; HubSpot's free CRM, the demo and a client's own (ADR 0003, spec
  #59); and Attio, for an agency already on it (#101).
- **Built-in CRM**: the CRM Nhịp will host for an agency that has none (#126, Twenty-based).
  One more adapter behind the same seam, never inbox tables. Not built; only the platform
  admin's CRM selector names it, as coming soon. A glossary name: the name agencies see is
  decided in #126's spec.
- **CRM lead**: the guest's record in the office's CRM (a contact with its deal). Not the
  funnel's **Lead**, which is a guest who wrote in.
- **CRM link**: the stored association between a thread and its CRM lead. Nhịp makes it when a
  guest writes on a thread that has none: it finds the guest's CRM lead (by phone on WhatsApp,
  by the Zalo user id Nhịp stored on Zalo) or creates one. A guest who matches two CRM leads is
  linked to neither. The thread header shows the CRM lead, read-only. A thread of an office with
  a CRM that has no link yet (the write failed, or the guest matched two leads) reads **"Not in
  CRM yet"**, and opening it retries the write once a stored wait has passed (#211).

## Guest data

- **Guest deletion**: a manager deleting one guest's data from Nhịp on request (Vietnam's
  PDPL; ADR 0020), from the thread header's ⋯ menu.
  - **What goes:** the thread and everything under it: messages, translations, the suggested
    reply, sent replies, the extracted details, the CRM link, and any bell row that named the
    thread.
  - **The CRM lead goes too only if the manager ticks it.** The box is ticked by default when
    Nhịp created the lead, and unticked when Nhịp found it there. Ticked, Nhịp deletes what it
    made in the CRM: the deal, and the contact only if Nhịp created it and it has no other deal.
    Unticked, Nhịp only unlinks. A failed CRM delete isn't retried; the manager deletes it there.
  - **When it's refused:** while a reply is sending.
  - **Who can't:** agents ask a manager, and the platform admin never deletes.
  - **What stays:** a lead tally and a receipt (`GuestDeletion`: office, who, when, why (a
    reason, and a note with phone numbers and emails masked), row counts, the CRM result). Neither names the guest, and receipts are read on request, not shown in the app.
  - A guest who writes again is a new guest, with a fresh thread. There is no list of deleted
    guests.
- **Lead tally**: what a deleted guest leaves in Home's numbers: the office, first contact and
  first reply times, whether they reached in conversation, the CRM outcome, the pipe and the
  language. No identifier and no text. Home counts tallies with the office's threads, so a past
  period's numbers never move when a guest is deleted.

## Billing

- **Seat**: one operator in an office, the unit the office pays for (ADR 0014). The
  platform admin is never a seat.
- **Lapsed**: an office whose paid period ended without renewal. Locked for operators;
  guest messages keep landing and wait for it.
- **Closing**: an office that asked to be deleted. Locked and unbilled, restorable for 30
  days, then purged with its threads and its operators' accounts.

## Deliberately not

Nhịp is not, and is not becoming, any of these; recorded so they do not creep in.

- **Not a guest-facing bot.** Guests talk to the agency. Nhịp sends one message on its own:
  the labelled auto-reply to a new guest's first message (ADR 0021). Every other message
  they receive was approved by a human, and Nhịp never converses.
- **Not legal advice.** Paperwork is flagged to the agent, never explained to the guest.
- **Not the record of deals.** The inbox links to a CRM through an adapter and never holds
  deals itself. The CRM is the office's own, or the built-in CRM Nhịp hosts beside the inbox
  (#126).
- **Not a listings database.** Listing match reads from a pool the office already keeps;
  Nhịp does not scrape or maintain listings.
- **Not a marketplace or a rental operator.** No guest-side accounts, no bookings, no
  payments between guest and agency.
- **Not a per-agent performance tool** in this version. Office numbers only.
- **Not mass-market brokerage.** High-end apartments, multinational guests.
- **No notification emails.** They get ignored. Nhịp emails only what the person is waiting
  for that moment (the invitation, the sign-in link, email verification, password reset,
  email change), plus the welcome email when a person joins. Everything else is a bell row
  or an alert (ADR 0019); a broken pipe is a bell row for the platform admin (ADR 0017).
