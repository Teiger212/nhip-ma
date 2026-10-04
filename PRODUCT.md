# Nhịp

<!-- impeccable:product-schema 1 -->

Working name only (pulse of the first reply). Not a brand lock. Terms are defined once in
[CONTEXT.md](./CONTEXT.md); decisions and their reasons are in [docs/adr](./docs/adr); how
the system is built today is [ARCHITECTURE.md](./ARCHITECTURE.md).

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
- **Manager**: the customer. Reads Home, sees every thread, invites the agents.
- **Office**: the tenant. A thread starts in its pool and belongs to the agent who answers it
  (ADR 0015).

Full definitions are in CONTEXT.md. Not mass-market brokerage. Not a rental operator. Not
a marketplace.

## Platform

web

## Operating Context

- **Agents** work on a phone and at a desk about equally through the day: answering between
  viewings on the phone, and at the office on a laptop. Sessions are short and interrupted;
  the queue decides what comes next.
- **Managers** read Home and reassign threads, on a laptop or a phone.
- **Languages**: the interface is English and Vietnamese (operators); guests write in
  English, Vietnamese, Japanese, Korean and Russian, and see only the agency's own
  WhatsApp or Zalo, never Nhịp.
- **Speed is the product**: a guest answered in minutes, at any hour, with a human approving
  every message.

## Brand Commitments

Nhịp is still a working name; no logo or voice is fixed. The visual system in use is
[DESIGN.md](./DESIGN.md), "The Dispatch Desk" (2026-10-03): flat panels on a tinted
canvas, one action blue, and the turn (amber waiting, green sent) as the only other color.
Design work proposed it; Eyal may revise it.

## Evidence on Hand

Some real material exists (Eyal, 2026-09-30), not yet catalogued here: ask what and where
before using any. Nothing else may be claimed: no customers, testimonials, metrics or
screenshots of real guests. The seed's demo threads (Minji, Yuki, Alexei, Thảo) are invented.

## Product Principles

- **A human approves every message.** Nhịp drafts; the agent decides and sends.
- **The queue, not the mailbox.** What waits on the agent comes first; nothing is dismissed.
- **Both directions of the language bridge.** Every guest message is translated for the
  agent; every reply is drafted in the guest's language.
- **Never invent facts.** No Vietnamese law, no listing detail the office did not provide.
- **Office numbers, not people's scores.** Home is office-level; no per-agent ranking yet.

## Accessibility & Inclusion

No formal standard is set. Operators read in English or Vietnamese (diacritics must render
well at small sizes); guests' text arrives in Latin, CJK and Cyrillic scripts.

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
   lost, then leads by day and response time (the median, and how many leads were answered
   within 5, 15 and 60 minutes), over the office's last 30 local days. Closings and lost
   come from the office's CRM. Same numbers for every operator; no per-agent breakdown yet.
   Beside them, **Waiting now** lists the guests whose turn it is, oldest first, that this
   operator can open, each one tap from its thread.

## Integrations

- **Pipes**: WhatsApp Cloud API, Zalo OA. One adapter each.
- **CRM**: one adapter per system. Attio for the first client (#101, decided 2026-10-04: the
  client's own free workspace, one default deal owner per office); HubSpot is the demo CRM;
  the mock is for development and demos only and never goes to production for a client.
  Guests match to CRM leads by phone number; managers link the rest by hand (ADR 0003,
  amended 2026-10-03). Nhịp reads outcomes; it does not become the CRM.
- **Drafting**: one adapter per model provider, with the template drafter as fallback.

## Advanced MVP

The next stage (decided 2026-09-27). **Every MVP feature runs end to end on real
infrastructure, and Eyal dogfoods it on staging before an agency sees it.** It is a technical
line, not a sales one: signing beta agencies runs alongside and only shapes it lightly (a beta
agency can be onboarded without an engineer).

**Environments** (ADR 0016): dev on each machine with mock sends; staging and prod on Vercel
and Neon in Singapore. Staging runs real WhatsApp and Zalo pipes with test identities. main
deploys to staging; prod ships by GitHub Release of a commit staging already ran.

**In scope**

- Everything built: capture, translate, extract, draft, queue, approve and send, follow-up,
  Home, office tenancy, invitations, the account lifecycle. The CRM seam has shipped with the
  mock and HubSpot (#72, #74, #75, #76, #88, #90); open: #64, #67, #68, #69–#71 and the
  staging demo (#116). Searching the CRM to link a thread by hand is for managers only
  (2026-10-03).
- Pool then owner inside an office; managers invite their own agents; offices, pipes and
  managers set up in the admin area without a script (ADR 0015).
- Each office sends from its own numbers (per-connection pipe credentials).
- New-message alerts (web push, installable app); photos and voice notes shown in threads,
  images sent; the WhatsApp reopen template for guests past the 24-hour window.
- Drafts that cannot invent a fact or be steered by a guest: a decision-model spike (Jev,
  Laya or an LLM behind one seam) for typed guardrail checks; a per-office model cost guard.
- Billing, minimal: per seat and the lapse lock (ADR 0014: decided, but it lives on branch
  `docs/adr-0014-office-pays` and lands with its build, #93); the 30-day close by hand.
  Until then the kit's own billing screens (priced per user) stay hidden.
- Error tracking, logs, uptime and a webhook delivery log; rate limits on public endpoints;
  a tested backup restore; deleting a guest's data on request. Error reports never carry a
  guest's personal data: message text, names and phone numbers are scrubbed before anything
  leaves the app.
- English and Vietnamese only.

**Later, shown as "Coming soon"**: saved replies (a decision model picks from the office's
approved replies and fills the reply box when confident; no popup list), the weekly digest,
CSV export.

**Later, not shown**: internal notes, an admin audit log, a per-office AI kill switch,
listing match, per-agent performance, nudges, native iOS and Android apps built from the web
app (#124).

**"Coming soon" rule**: a later feature gets a disabled control only where it will obviously
live, and only if we are confident it ships. It names the feature, never a date.

**Trust bar**

- Before staging's public URL goes live: the red team's auth lockdown (batch A), rate
  limits, staging secrets only in the platform.
- Before a beta agency's real guests reach prod: every critical and high finding fixed and
  proven; the remaining red-team surfaces run, then a re-run on the release candidate; every
  medium fixed or accepted in writing; observability, the restore drill and guest-data
  deletion in place.
- Afterwards: a PR touching auth, tenancy, the send path or webhooks gets a focused red-team
  run before release.

**Done** (AGENTS.md, "What gets a test"): logic has Vitest tests; user flows have Playwright
specs that run in CI; a Playwright smoke run passes on staging after each deploy; the release
checklist includes a real round trip from a phone.

## Build order

Each milestone leaves staging better than it found it. Status as of 2026-10-04, from merged
PRs; "open" means not started unless it says otherwise.

1. **Foundations, staging live**: CI (lint, types, Vitest, Playwright over HTTPS), the
   `prisma migrate` baseline, Vercel and Neon staging, background work on `after()`,
   observability (error tracking on PostHog Cloud, **personal data scrubbed from day one**,
   due 2026-09-30; the PostHog project set to discard client IPs), rate limits, the red
   team's auth lockdown, English and Vietnamese only.
   _Done_ (#33, #34, #39, #41, #44, #45): staging migrates on build, the staging smoke runs
   after each deploy, and the webhook delivery log is in. _Waiting on Eyal_: the PostHog
   project, its discard-IP setting and its keys (docs/setup-checklist.md); until then
   nothing is sent.
2. **Offices and people**: office setup in the admin area, managers invite agents, the
   platform admin out of offices, pool then owner, per-connection pipe credentials.
   _Done_: the platform admin out of offices and landing in the admin area (#37), pool then
   owner (#46), per-connection credentials for Zalo (#38), office setup in the admin area in
   two steps. _Open_: the one-step setup (ADR 0018); managers inviting their own agents (the
   kit's members page exists but nothing links to it); WhatsApp credentials per connection
   (one number per deployment from env today).
3. **Send and model safety**: the red team's send-path fixes, guest-proof drafts through the
   decision-model spike, the model cost guard.
   _Partly done_: the send-safety fixes in #32 (status-guarded retry, inbound dedupe, Zalo
   replay window). _Open_: the decision-model spike, the cost guard.
4. **Reaching the agent**: alerts, photos and voice, the WhatsApp reopen template.
   _Open_.
5. **Counting and paying**: the CRM seam merged, minimal billing, guest-data deletion,
   "Coming soon" controls.
   _In progress_: the CRM seam has shipped (#72, #74, #75, #76, #88, #90); open: #64, #67,
   #68, #69–#71, the staging demo (#116) and Attio for the first client (#101). _Open_: billing
   (#93; the kit's screens stay hidden), guest-data deletion, "Coming soon" controls.
6. **Go-live gate**: the remaining red-team surfaces and a re-run, the restore drill, the
   dogfood checklist, Vietnam's personal data protection duties (the cross-border transfer
   impact assessment filed with A05 for hosting in Singapore, the model providers, the
   client's CRM (Attio) and HubSpot's EU portal for the demo, confirmed with a Vietnamese
   lawyer), the first GitHub Release to prod.
   _Open_. Go-live target: first client on production by 2026-10-18 (#99).

**Pulled forward (2026-09-28)**, so staging can dogfood a real pipe: from milestone 2,
roles and landing (the platform admin lands in the admin area; office setup is one step,
ADR 0018) and pipe connections, Zalo first (ADR 0017); then PR previews (ADR 0016); then
WhatsApp once its number exists. Milestone 1's observability runs alongside.
_Status_: roles and landing, and Zalo pipe connections, are done (#37, #38). PR previews
are not: Vercel builds only `main` and `production` until previews get their own database.
WhatsApp waits on its number.

**Alongside the milestones**: the design system, DESIGN.md (#47–#49, merged), and the
desk refit (#50 lint rules; #52, landed through #53: Home rebuilt and the audit's
fixes), merged 2026-10-03.

Shipped before this stage: the conversation loop (ADR 0009), office tenancy and Home, the
account lifecycle (ADR 0013). Listing match stays the horizon.

## Deliberately not

Not a guest-facing bot. Not legal advice. Not a CRM. Not a listings database. Not a
marketplace or rental operator. Not a per-agent performance tool, yet. Full list with
reasons in CONTEXT.md.
