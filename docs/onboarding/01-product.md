# Chapter 1: The Product — what Nhịp is, who it serves, and the rules it refuses to break

_Part of the [onboarding walkthrough](./README.md)._

Nhịp is a speed-to-lead product for high-end apartment agencies in Vietnam. A prospective tenant or buyer writes the agency on WhatsApp or Zalo, often in Japanese, Korean, Russian or English; Nhịp detects the language, extracts what they said, translates the message for the agent, drafts a reply in the guest's language, and puts it in a queue. A human agent taps "Approve and send" for that one guest message and it goes out on the agency's own number. Nothing is ever auto-sent. There are two roles: the agent, who lives in the Inbox, and the manager, who pays and reads Home. The Inbox is a queue where "Your turn" simply means the guest spoke last, threads untouched for 48 hours fold into a "quiet" section, and there is no dismiss button so the count stays honest. Home shows the office funnel — leads in, engaged, in conversation, closings, lost — over a 30-day cohort counted from Answer rows in SQL, with closings and lost reserved for the CRM adapter that is not built yet, so those two cards say "Connect your CRM" rather than showing a zero. Listing match, nudges and per-agent breakdowns are deliberately out of scope. The build order was conversation loop first (shipped 2026-09-18), then office tenancy and Home (shipped 2026-09-20), then the CRM adapter (next).

## What Nhịp is and for whom

Nhịp (working name; Vietnamese for "pulse", as in the pulse of the first reply) is a speed-to-lead product for agencies selling and renting high-end apartments in Vietnam, Hà Nội first. The problem: a multinational lead writes in on WhatsApp or Zalo in Japanese, Korean, Russian or English, and a Vietnamese-speaking agent on a phone either answers slowly or not at all. The lead goes to whoever answers first.

The **wedge** is the first reply within minutes, at any hour. The **durable value** is the **language bridge**, and it runs both ways: every guest message is translated into the operator's language (EN or VI) and shown under the original (ADR 0007), and every reply is drafted in the guest's language (ADR 0005). The **horizon** is **listing match**: searching the office's own property pool against what the guest said. It is not built and depends on a listings source the office already keeps.

The guest never sees Nhịp; they see the agency's number. That is enforced in code: replies go out on the same pipe the guest used, from the office endpoint the guest wrote to (`Message.pipeExternalId`, ADR 0010).

The job in order (PRODUCT.md): capture, understand, draft, queue, approve, send, follow up, count. "Understand" is a deterministic regex pass called the **one-shot** (`apps/saas/modules/inbox/lib/draft.ts:oneShot` → `extract.ts:extractFromInbound`): language, a seven-field `Qualification` (area, nationality, in Vietnam now, rent or buy, timeframe, budget band, beds or household), and a `Paperwork` flag. The first reply is a template keyed on language and the extracted facts (`draftReply`); follow-ups are model-drafted from the whole conversation behind the draft adapter. The **operator note** (`crib.ts`) is rendered at read time from the qualification in the agent's language, is never sent to the guest, and never invents Vietnamese law.

What it is not: not a guest-facing bot, not legal advice, not a CRM, not a listings database, not a marketplace or rental operator, not mass-market brokerage.

Sources: `PRODUCT.md`, `CONTEXT.md`, `README.md`, `apps/saas/modules/inbox/lib/draft.ts:37-84`, `apps/saas/modules/inbox/lib/crib.ts`, `packages/database/inbox/types.ts:26-52`, `docs/adr/0005-ai-suggested-reply.md`, `docs/adr/0007-translate-guest-messages.md`

## Two roles, two screens, one tenant

ADR 0001 (2026-09-17) fixes the shape. The **agent** is the _user_: answers guests, mostly in Vietnamese with some English, on a phone. Their question is "what is waiting on me". They live in the **Inbox**. The **manager** is the _customer_: the office manager or owner who pays for faster responses and fewer lost multinational leads. Their question is "how fast are we and what are we losing". They read **Home**. The word **operator** covers either when the role does not matter ("Operator note", "Your turn").

Why two screens: a product that serves only the agent has no story for the buyer; one that serves only the manager is a dashboard nobody works in.

Three deliberate simplifications:

1. **No role gating on read.** Home is visible to every operator; agents see the same numbers the manager sees. Permissions are not modelled until something must be hidden. In code, `apps/saas/modules/home/lib/funnel.ts:loadHomeFunnel` checks only that there is a session and one office membership; no role check.
2. **Office-level numbers only.** No per-agent breakdown. It is a future feature, not a hidden one. Threads carry `Answer.operatorId` (who approved), so the data exists; building it means deciding what an agent "owns", which is why it is deferred.
3. **The office is the tenant** (ADR 0008). It owns its pipes (the WhatsApp number, the Zalo OA), its CRM connection, its agents and its threads. Threads are shared: any agent can open, draft and approve any thread. The office is the supastarter kit's `Organization`; `Conversation.officeId` references it with cascade delete (ADR 0012). ADR 0010 adds: Nhịp assigns offices (platform admin creates, agents are invited, public sign-up is closed), one operator belongs to exactly one office, and the gate reads membership on every request — never the session's client-writable "active organization", which an outside audit showed was exploitable. Zero memberships is `403 no_office`, more than one is `403 ambiguous_office`.

MVP shape: one agency, one office. Multi-office agencies later, as several tenants under one billing account.

Sources: `docs/adr/0001-two-roles-two-screens.md`, `docs/adr/0008-office-is-the-tenant.md`, `docs/adr/0010-office-assignment.md`, `apps/saas/modules/home/lib/funnel.ts`, `apps/saas/modules/inbox/lib/walk-user.ts`, `packages/database/inbox/types.ts:161-181`

## The queue vocabulary: Your turn, quiet, sent, resolved

The Inbox is a **queue, not a mailbox**. The rules live in one file, `apps/saas/modules/inbox/lib/queue.ts`, and the client renders a `QueueView` without restating them.

**Your turn**: the guest spoke last. "A fact, not a judgment." ADR 0004 explains the rename from "Needs reply": a closing "thanks, talk Monday" from a guest is not work, but under "Needs reply" it looks like unfinished work forever. Adding a "no reply needed" button would let agents dismiss threads and make the funnel lie. So: **there is no dismiss**. The queue empties only through sends and CRM outcomes; the count goes down only when the office replies or closes.

In code, `yourTurn(c)` is `c.unansweredInboundId !== null`. That id is derived in `packages/database/inbox/store.ts:mapConversation` (lines 173-186), and since ADR 0011 it is derived **from Answers, not message order**: walk back to the guest's latest inbound; it is unanswered unless an Answer with status in `ANSWERING_STATUSES = ["sending", "sent", "unknown"]` targets it, or an `oa-echo` outbound (the agent replied from the vendor app) follows it. A `failed` Answer leaves the thread in Your turn. This matters because a guest message that lands mid-send must not be hidden by the outbound answering the earlier one.

**Quiet**: still Your turn, but the guest last wrote more than 48 hours ago. `QUIET_AFTER_MS = 48 * 60 * 60 * 1000`, a product constant, not a setting, "until someone asks". `isQuiet` checks `now - lastGuestInboundAt > QUIET_AFTER_MS`. Rendered as a collapsed `<details>` at the bottom of the list (`ThreadList.tsx:101-108`) labelled "Quiet (n)". Quiet threads still count in the Your turn tab count.

**Sent**: the office spoke last; `inView` for the `sent` view is `!yourTurn`.

**Order**: Your turn is oldest waiting guest first (`compareForView` sorts by `lastGuestInboundAt` ascending); Sent and All are most recent activity first. Views are `INBOX_VIEWS = ["yourTurn", "sent", "all"]`, default `yourTurn`. `caughtUp` is true when the queue view is empty with no search and there are threads at all, which the list shows as "All caught up".

**Resolved**: the CRM reports won or lost, the thread leaves the queue and lives under Sent / All. This is vocabulary only; there is no resolved state, outcome field or CRM adapter in code yet. ADR 0004 accepts the consequence: an office without a CRM has no outcome path, so its quiet section grows, and that is a reason to connect the CRM, not to add dismiss.

The client polls every 10 seconds (`inbox-queries.ts:POLL_INTERVAL_MS`), which is how new inbounds, translations and model drafts arrive.

Sources: `docs/adr/0004-your-turn-queue.md`, `apps/saas/modules/inbox/lib/queue.ts`, `packages/database/inbox/store.ts:65,136-203`, `apps/saas/modules/inbox/components/ThreadList.tsx:95-112`, `apps/saas/modules/inbox/lib/inbox-queries.ts:15`, `CONTEXT.md`

## Reply-only, per-message approval, and why never auto-send

**Approve and send** is the single send action: one human approving one suggested reply for one inbound message. The guardrail is product identity ("every message the guest receives was approved by a human"), and ADR 0009's done line ends with "No auto-send path exists", proven by `loop.test.ts`, which asserts every office message on a thread is one Answer.

**Reply-only** (ADR 0006): every send answers exactly one guest message; one send per inbound; no unprompted sends. Why the unit is the _message_ and not the _thread_: before this, a thread had one send and was then terminal (`sentAt`), so a guest who wrote back could not be answered. Why not free sends (nudges): WhatsApp's 24-hour customer-care window forbids free-form messages outside the window and requires paid, pre-approved templates; Zalo has no such rule. `pipes/vendors.ts:WA_WINDOW_MS` enforces the window and refuses with `outside_24h_window`, saying "Nhịp v1 does not invent templates." Nudges are deferred: they need template approval, a different queue state, and no pilot has asked.

**The Answer** (ADR 0011, 2026-09-20, after an outside audit) is the record of a send: one row per inbound (unique index on `inboundId`), carrying the approved text, `operatorId`, and a status `sending → sent | failed | unknown`. It replaced the earlier `Approval` + `Send` tables and a claim column on `Message`. Three bugs it closes: an approval that carried only a thread id answered a new guest message with a reply written for the previous one; one try/catch around vendor call plus record meant a vendor success followed by a record failure released the claim and the retry sent twice; and Your turn read off message order hid a guest message that arrived mid-send.

The flow in `apps/saas/modules/inbox/lib/inbox.ts:approveAndSend`: the request body names `inboundId` and the exact `reply`. Refusals: `409 already_answered` (nothing open), `409 delivery_unknown` (an unreconciled Answer exists), `400 inbound_required`, `409 stale_target` (the guest wrote again since the draft), `400 empty_reply`, `409 outside_24h_window`, `409 pipe_not_configured` (live mode, wrong number). Then `store.beginAnswer` writes the row in `sending` inside one transaction **before** the vendor is called; a concurrent approval hits the unique index and returns `409 send_in_progress`. A `SendError` (vendor refused, missing credentials) marks `failed` and the same row may be approved again. Any other error (network, timeout) marks `unknown`; a vendor success whose record write fails also marks `unknown` and returns `500 record_failed` with "It will not be sent again." Unknown is never retried automatically; a person reconciles against the vendor first.

`SEND_MODE` defaults to `mock`; only the exact string `live` talks to a vendor.

Sources: `docs/adr/0006-reply-only-per-message-approval.md`, `docs/adr/0011-answer-is-the-record-of-a-send.md`, `apps/saas/modules/inbox/lib/inbox.ts:202-339`, `apps/saas/app/api/conversations/[id]/approve/route.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:7-33`, `packages/database/inbox/schema.ts:49-56`, `apps/saas/modules/inbox/lib/loop.test.ts:219-242`

## The funnel: definitions and how they map to code

ADR 0002's argument: the obvious speed-to-lead metric is time to first send, but agencies judge themselves on how many clients they interacted with and how many closings they got. "Response time is a means; the funnel is the end." So Home's headline is the five-stage funnel and response time is a supporting widget underneath.

Definitions (CONTEXT.md, Funnel) and their code:

- **Lead in**: a guest whose _first_ message landed in the window. SQL CTE `first` = `MIN(at)` over `inbox_message WHERE direction = 'in'` grouped by conversation; the outer `WHERE c.officeId = $office AND first.firstInboundAt >= $since`. `leadsIn = leads.length`.
- **Engaged**: a lead with at least one `sent` Answer. CTE `reached` = `MIN(sentAt)` over `inbox_answer WHERE status = 'sent'`. `engaged = durations.length`, where a duration exists only when `firstSentAt` is non-null. A `failed`, `unknown` or in-flight approval does not count.
- **In conversation**: a lead who wrote again after the first sent Answer. `EXISTS (SELECT 1 FROM inbox_message later WHERE later.direction = 'in' AND later.at > reached.firstSentAt)`. Two guest messages with no reply are not an exchange.
- **Closings / Lost**: from the CRM adapter only, never inferred from chat (ADR 0003). Not in the `Funnel` zod object at all; `Home.tsx` renders those two cards from `FROM_CRM = ["closings", "lost"]` with the copy "Connect your CRM — Closings and lost come from your CRM, never from the chat."
- **Response time**: first inbound to first `sent` Answer's `sentAt`, nearest-rank median and p90 over answered leads, in ms. `null` when nobody was answered.
- **Window**: `FUNNEL_WINDOW_DAYS = 30` in `apps/saas/modules/home/lib/funnel.ts`, fixed "until an office asks for a picker". The cohort is by first contact, so engaged and in conversation are counted inside it and the funnel never widens. A guest who first wrote 40 days ago and was answered yesterday is not a lead of this window.

The path: `Home.tsx` (server component) → `loadHomeFunnel()` → `getSession()` + `resolveOffice(userId)` (membership, not active org) → `store.funnel({ userId, officeId }, { since })` → one `$queryRaw` in `packages/database/inbox/store.ts:513-564` returning one row per cohort lead; only the percentiles are left to JavaScript. The result is validated by the `Funnel` zod schema in `schema.ts:83-94`. `Home.tsx` shows each stage as a card with a share bar against leads in and a "{percent}% of leads in" hint; `duration.ts:formatDuration` uses `Intl.NumberFormat` unit style so "12 min" / "12 phút" needs no copy.

Regression suite: `apps/saas/modules/inbox/lib/funnel.test.ts` builds Minji (lead, engaged, in conversation), Yuki (lead, engaged), Alexei (two unanswered messages: lead only), Thảo (failed then unknown: lead only), Old (outside cohort) and another office's guest, and expects `{ leadsIn: 4, engaged: 2, inConversation: 1 }`.

Sources: `docs/adr/0002-home-shows-the-funnel.md`, `docs/adr/0003-crm-adapter.md`, `CONTEXT.md`, `packages/database/inbox/schema.ts:65-94`, `packages/database/inbox/store.ts:513-564`, `apps/saas/modules/home/lib/funnel.ts`, `apps/saas/modules/home/lib/duration.ts`, `apps/saas/modules/home/components/Home.tsx`, `apps/saas/modules/inbox/lib/funnel.test.ts`, `packages/i18n/translations/en/saas.json (home.*)`

## The four guests: what the seed demonstrates

`apps/saas/modules/inbox/lib/seed.ts` exports `DEMO_THREADS`, four invented walkthrough threads ("Not real guests. Not Hạnh."), written once into the walk office (`WALK_OFFICE_ID = "walk-office"`) by `pnpm seed`. Each is chosen to exercise one part of the one-shot:

- **Minji** (WhatsApp, `demo-ko-stay`), Korean: "currently in Hanoi. Tay Ho에서 3 nights vs monthly stay 고민이에요. this Friday. 2 bedroom." Proves: language `ko`, nationality Korean, area Tây Hồ, rent, timeframe "this Friday", "2 bed", no paperwork. Mixed-script input.
- **Yuki** (WhatsApp, `demo-jp-buy`), Japanese: "Tay Hồで購入を考えています。Can foreigners get a pink book / sổ hồng?" Proves: language `ja`, intent **buy**, `paperwork.mentioned = true`, and the guardrail: the draft must not match `/you (can|will) (get|receive) a pink book/` or `/tomorrow/`. This is the "never invents Vietnamese law" test.
- **Alexei** (WhatsApp, `demo-ru-ciputra`), Russian: "Ищу аренду в Ciputra, 2 bedroom, $2000/month." Proves: `ru`, Russian, area Ciputra, rent, a dollar budget.
- **Thảo** (Zalo, `demo-vi-tayho`), Vietnamese: "Em muốn thuê căn 2 ngủ ở Tây Hồ từ đầu tháng 9, ngân sách 30 triệu." Proves: `vi` on the Zalo pipe, timeframe "đầu tháng 9", "2 bed", a VND budget.

Seeding is idempotent by identity, not by id: `seedInbox` lists the office's threads and matches on (pipe, guestId), so re-running writes nothing new (`seed.test.ts` asserts four threads, four messages, `sentAt === null`, `unansweredInboundId !== null`, and `draft.answersMessageId === unansweredInboundId` for every thread). The seed goes through `injectDevInbound` → `upsertInbound` → `afterGuestInbound`, the same path a webhook takes, so the seeded threads have a real one-shot and, with `DRAFT_API_KEY` set, background translations.

Two logins come with it, password `walkthrough`: `walk@nhip.local` (agent, member of the walk office) and `admin@nhip.local` (platform admin, owner of the walk office). The same four names reappear in `funnel.test.ts` as the cohort shapes, which is a useful thing to say in an interview: the demo data and the metric tests share one vocabulary.

Sources: `apps/saas/modules/inbox/lib/seed.ts`, `apps/saas/modules/inbox/lib/seed.test.ts`, `apps/saas/modules/inbox/lib/walk-user.ts`, `apps/saas/modules/inbox/lib/inbox.ts:115-138`, `HANDOFF.md:27-38`

## Deliberately out of scope, and why

CONTEXT.md keeps a "Deliberately not" list "so they do not creep in". The ones an interviewer will probe:

**Listing match** is the horizon, not the backlog. It depends on a listings source the office already keeps; Nhịp will read from that pool and never scrape or maintain listings. Until it exists, ADR 0005's guardrail is that a draft "may only acknowledge and ask, not answer" on price, availability or viewing times — never state a listing fact the office has not provided. The first-reply template literally says "A colleague will reply here on this same chat"; listing match is what replaces that sentence with the best few matches.

**Nudges** (unprompted sends) are deferred by ADR 0006. Reasons: WhatsApp requires paid, pre-approved templates outside the 24-hour window; a nudge needs a different queue state; no pilot has asked. The `sendWindow` check in the WhatsApp pipe adapter refuses free-form sends outside the window rather than inventing a template.

**Per-agent breakdown** is out by ADR 0001: Home is office-level only. It would require deciding what an agent owns (the thread, or each send). `Answer.operatorId` records who approved, so nothing is lost by waiting.

**Dismiss** is out by ADR 0004: it would let agents make the queue count lie. The queue empties through sends and CRM outcomes only.

**Being the CRM** is out by ADR 0003: a closing is a fact the office already records; asking agents to mark outcomes inside Nhịp duplicates and drifts; inferring outcomes from chat is invention. Hence the adapter seam, Attio as a provisional first adapter, a mock adapter backed by a local table for offices without a CRM, phone-number (E.164) matching with a manual "link to CRM lead" fallback, and **never name matching** because it is wrong often enough to poison the funnel.

**Legal advice**: paperwork is flagged to the agent (the operator note), never explained to the guest; `drafts/guardrails.ts:checkFollowUp` drops any model draft that touches paperwork or ownership (sổ hồng, pink book, 소유권) and the template stands.

**Guest-facing bot, marketplace, rental operator, mass-market brokerage**: no guest accounts, no bookings, no payments; the guest only ever talks to the agency's number.

Also not product: the kit's marketing, docs, admin, billing and org-switcher screens. They stay in the tree as supastarter scaffolding. The kit organization _is_ in use, as the office, with its switcher hidden.

Sources: `CONTEXT.md`, `PRODUCT.md`, `docs/adr/0001-two-roles-two-screens.md`, `docs/adr/0003-crm-adapter.md`, `docs/adr/0004-your-turn-queue.md`, `docs/adr/0005-ai-suggested-reply.md`, `docs/adr/0006-reply-only-per-message-approval.md`, `apps/saas/modules/inbox/lib/loop.test.ts:273-310`, `ARCHITECTURE.md:101-108`

## Build order and the done lines

ADR 0009 (2026-09-17) sequenced the eight earlier ADRs because they are not independent: the funnel (0002) counts sends per inbound, which needs per-message approval (0006); the CRM adapter (0003) needs an office to belong to (0008); translation (0007) and AI drafts (0005) share the draft adapter seam.

**Build 1: the conversation loop**, one PR, in order: (1) Your turn wording, the quiet section, reply-only approval; (2) guest message translation behind the draft adapter, stored per message per operator locale; (3) AI follow-up drafts from conversation context, template fallback, guardrails. Its done line, verbatim: "A guest who writes back after an approved send returns to Your turn with their message translated under the original and an AI-suggested follow-up in the reply box; the agent approves it and it sends; a third approve with no new inbound is 409. Proven by one saas test that walks that path and by the same path through the dev server with SEND_MODE=mock, both pasted. Lint, type-check, and the full test suite exit 0. No auto-send path exists." That test is `apps/saas/modules/inbox/lib/loop.test.ts` ("the conversation loop: reply, guest writes back, translated, AI follow-up, reply, 409"). Shipped 2026-09-18 (CHANGELOG).

**Build 2: office and Home**: office tenancy (0008, hardened by 0010 after an audit), Home with the funnel (0001, 0002), the Attio and mock CRM adapters (0003). ADR 0009 said Home's "connect your CRM" empty state ships first so the screen exists before the numbers do; that is exactly what the 2026-09-20 Home did. Then the send contract was rebuilt as the Answer (0011) and the inbox moved from SQLite into the kit's Postgres through Prisma (0012), both 2026-09-20. The funnel over Answers is built and tested. **The CRM adapter is the remaining piece of build 2** and the next step.

**Build 3: listing match**, the horizon.

How to say the current state: capture, understand, draft, queue, approve, send, follow up and count are all live for the three stages Nhịp can count itself; closings and lost wait for the adapter. Constraints that held throughout: cheapest model that translates VI/JA/KO/RU reliably (one vendor-neutral OpenAI-compatible adapter, OpenRouter by default, `DRAFT_API_KEY` + `DRAFT_MODEL`); regex stays where regex is enough (language detection, extraction); every user-facing string under `inbox.*` / `home.*` in EN and VI; gates before commit are format, lint, type-check, and the saas test suite against a `supastarter_test` Postgres.

Sources: `docs/adr/0009-build-order.md`, `docs/adr/0012-inbox-on-prisma.md`, `CHANGELOG.md:1-42`, `apps/saas/modules/inbox/lib/loop.test.ts:34-39,107`, `HANDOFF.md:45-46`, `ARCHITECTURE.md:89-93`

## Key facts

- Nhịp is speed-to-lead for high-end apartments in Vietnam: an inbound on WhatsApp or Zalo becomes a human-approved reply in the guest's language (EN, VI, JA, KO, RU) from the agency's own number.
- Two roles, two screens: the agent (user) lives in the Inbox queue; the manager (customer) reads Home; Home is visible to every operator with no role gating and office-level numbers only (ADR 0001).
- The office is the tenant and is the supastarter kit Organization; threads are shared inside it, one operator belongs to exactly one office, resolved from membership on every request, never the session's active org (ADRs 0008, 0010).
- "Your turn" means the guest spoke last; in code it is `Conversation.unansweredInboundId !== null`, derived in `store.ts:mapConversation` from Answers with status sending, sent or unknown, not from message order (ADR 0011).
- Quiet is a Your-turn thread the guest last touched more than 48 hours ago: `QUIET_AFTER_MS = 48h` in `queue.ts`, a product constant, rendered as a collapsed section at the bottom of the queue.
- There is no dismiss: the queue empties only through sends and CRM outcomes, so the count cannot lie (ADR 0004).
- Reply-only: every send answers exactly one guest message; the approve request names `inboundId` and the exact text; refusals are 409 stale_target, 400 inbound_required, 400 empty_reply, 409 already_answered, 409 delivery_unknown (ADRs 0006, 0011).
- The Answer row is written in status `sending` before the vendor is called; the unique index on `inboundId` blocks concurrent approvals; `failed` may be retried on the same row, `unknown` is never retried automatically.
- Never auto-send is proven by `loop.test.ts`, which walks ADR 0009's done line and asserts every office message is one Answer.
- Nudges are deferred because WhatsApp's 24-hour customer-care window requires paid templates; the WhatsApp pipe adapter refuses free-form sends outside the window (`WA_WINDOW_MS`).
- The funnel is leads in, engaged, in conversation, closings, lost; Nhịp computes the first three in one SQL query in `store.funnel`; closings and lost come only from the CRM adapter, which is not built, so Home shows "Connect your CRM" instead of a zero.
- Cohort rule: `FUNNEL_WINDOW_DAYS = 30` by first inbound; engaged = a lead with a `sent` Answer; in conversation = a guest message after the first sent Answer; response time = first inbound to first `sentAt`, nearest-rank median and p90.
- The seed writes four invented guests into the walk office: Minji (KO, rent, Tây Hồ), Yuki (JA, buy, paperwork flag), Alexei (RU, rent, Ciputra), Thảo (VI on Zalo); logins walk@nhip.local and admin@nhip.local, password walkthrough.
- Build order (ADR 0009): conversation loop (shipped 2026-09-18), then office tenancy plus Home and the Attio/mock CRM adapters (tenancy and Home shipped 2026-09-20; CRM adapter next), then listing match as the horizon.
- The first reply is a regex-keyed template; follow-ups are model drafts from the whole conversation behind one vendor-neutral OpenAI-compatible draft adapter, with a post-check that drops any draft touching paperwork or ownership.

## Trade-offs

### "Your turn" as the only pending state, with no dismiss action

**Alternatives:** A "Needs reply" label plus a "no reply needed" button; per-thread status fields agents set by hand

**Why:** Whether a thread needs a reply is a judgment Nhịp cannot make; a dismiss button lets agents shrink the queue without a send or a real outcome, which makes the funnel lie

**Cost:** Offices without a CRM connected have no outcome path, so their quiet section grows without bound; a closing "thanks" from a guest sits in Your turn until 48 hours pass

### The funnel as Home's headline, response time as a supporting widget

**Alternatives:** Speed-to-first-send dashboards (median, p90, sends per day, language mix, waiting guests) as ADR 0001 first listed

**Why:** Agencies judge themselves on clients interacted with and closings, not seconds to first reply; response time is a means, the funnel is the end

**Cost:** Two of the five stages depend on a CRM adapter that is not built, so the headline screen ships with two cards that say "Connect your CRM"

### Reply-only per-message approval, nudges deferred

**Alternatives:** Free sends the agent starts (nudges); thread-level approval with one terminal send

**Why:** WhatsApp forbids free-form messages outside the 24h window and needs paid templates; the unit of approval as the inbound message is what makes the funnel's engaged/in-conversation counts fall out naturally and lets a guest who writes back be answered

**Cost:** An agent cannot chase a silent lead from inside Nhịp; a Your-turn thread that goes quiet has no in-product follow-up path until nudges exist

### The Answer row written before the vendor call, with `unknown` never auto-retried

**Alternatives:** Approval plus Send rows written after the vendor call inside one try/catch (the previous design); automatic retry on timeout

**Why:** An outside audit showed the gap between approval and record let a stale reply go to a new message, a vendor success with a record failure send twice, and a mid-send guest message vanish from the queue

**Cost:** A network timeout leaves a thread stuck behind 409 delivery_unknown until a person reconciles it against the vendor; there is no reconciliation UI yet

### Closings and lost come only from the office's CRM through an adapter; phone-number matching, never name matching

**Alternatives:** Agents mark won/lost inside Nhịp; infer outcomes from chat text; fuzzy name matching to CRM contacts

**Why:** The office already records deals; duplicating drifts, inferring is invention the product refuses; name matching is wrong often enough to poison the funnel

**Cost:** Zalo guests, who often carry only a Zalo id, usually need a manual "link to CRM lead" step; Attio is a provisional pick with no pilot office having named its CRM

### A fixed 30-day cohort by first contact for the funnel

**Alternatives:** A period picker; counting engaged/in-conversation by event date rather than lead cohort

**Why:** One fixed window until an office asks; cohorting by first contact means the funnel narrows monotonically and never widens

**Cost:** A guest who first wrote 40 days ago and was answered yesterday is invisible on Home; no way to compare periods

## Where the docs and the code disagree

- PRODUCT.md "Build order" still marks "1. Conversation loop (next)"; CHANGELOG shows the loop shipped 2026-09-18 and office tenancy plus Home shipped 2026-09-20. Only the Attio/mock CRM adapters remain from step 2.
- CONTEXT.md defines a "Resolved" queue state and ADR 0004 says a CRM won/lost outcome removes a thread from the queue; no such state exists in code. `queue.ts:INBOX_VIEWS` is yourTurn/sent/all, `Conversation` has no outcome field, and no CRM adapter or `crm` module exists (only comments reference it).
- ADR 0001's consequences say "Threads already carry ownerUserId" and list Home widgets (waiting guests, sends per day, language mix). `ownerUserId` was replaced by `officeId` (ADRs 0008/0012) and only the funnel plus response time are built (ADR 0002 superseded the widget list).
- ADR 0006 describes `Approval` and `Send` tables with `answersMessageId` and a claim on `Message`; ADR 0011 replaced all three with the single `Answer` table (`inbox_answer`, unique on `inboundId`). ADR 0006 still reads status "accepted" with no forward pointer; only 0011 says "Refines ADR 0006".
- ADRs 0006, 0007 and 0011 say "existing files migrate on open"; that was the SQLite store. ADR 0012 deleted the SQLite store, `ensure-schema.ts` and its migrations, and there is no migration-on-open code in `packages/database/inbox/store.ts`.
- README.md says "Approve claims the thread atomically before sending"; the claim is now per guest message, the unique index on `Answer.inboundId` inside `beginAnswer` (ADR 0011), not per thread.
- ARCHITECTURE.md's inbox modules table says `drafts/` is "Draft adapter: Anthropic or none", contradicting its own Drafting section and the code: `drafts/adapter.ts:DraftProvider = "none" | "openai-compatible"`, a plain fetch to an OpenAI-compatible `/chat/completions` (OpenRouter by default).
- CONTEXT.md says engaged is a lead who "received at least one approved send"; the code counts only Answers with status `sent` (`store.funnel` CTE `reached` filters `status = 'sent'`). An approved Answer that ended `failed` or `unknown` does not count. ADR 0011 states this precisely; CONTEXT's wording is looser.
- PRODUCT.md and CONTEXT.md describe drafting as "one adapter per model provider"; the code has one vendor-neutral OpenAI-compatible adapter plus `none`. Any provider with an OpenAI-compatible endpoint is a config change, not a new adapter.

## Interview questions for this chapter

See [the interview chapter](./07-interview.md) for the 5 questions that target this chapter.
