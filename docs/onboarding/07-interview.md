# Chapter 7: The interview

_Part of the [onboarding walkthrough](./README.md)._

Fourteen questions per interviewer, two interviewers, written by a senior engineer persona who read the chapters and checked them against the code. Each has the answer a candidate who built this would give, the follow-up that comes next, and what a weak answer sounds like. Read the question, answer it aloud, then open the answer.

## Warm-up

### In two minutes: what is Nhịp, who pays for it, and what does the guest ever see?

_Chapter: product_

<details><summary>Strong answer</summary>

Nhịp is speed-to-lead for agencies renting and selling high-end apartments in Vietnam, Hà Nội first. A lead writes the agency on WhatsApp or Zalo in Japanese, Korean, Russian or English; a Vietnamese agent on a phone answers late or never. Nhịp runs a deterministic regex pass (`oneShot` in draft.ts) that detects the language and extracts a seven-field qualification plus a paperwork flag, translates the message for the agent in the background, and puts a template reply in the guest's language in a queue. A human taps Approve and send for that one guest message. The reply leaves on the agency's own number: `Answer.pipeExternalId` is copied from the inbound, so the guest never sees Nhịp. Two roles: the agent is the user and lives in the Inbox; the manager is the customer, pays, and reads Home. Nothing is auto-sent; `loop.test.ts` asserts every office message on a thread is one Answer. It is not a bot, not legal advice, not a CRM and not a listings database.

</details>

**Follow-up:** What is the durable value once a competitor also replies in five minutes, and what is the horizon feature you have deliberately not built?

**A weak answer sounds like:** "It's an AI chatbot for real estate that auto-replies to leads in their language." Missing: human approval of every send, the agency's own number, the two roles, and that the first reply is a template, not a model.

Sources: `PRODUCT.md`, `CONTEXT.md`, `apps/saas/modules/inbox/lib/inbox.ts:209-339`, `apps/saas/modules/inbox/lib/draft.ts`, `packages/database/inbox/store.ts:395-410`, `apps/saas/modules/inbox/lib/loop.test.ts:219-242`, `docs/adr/0001-two-roles-two-screens.md`

### Why build on the supastarter kit instead of a lean Next app, and what does "kit first" cost you?

_Chapter: tools_

<details><summary>Strong answer</summary>

One developer, one pilot. Sessions, passkeys, 2FA, invitations, admin lists, org membership and i18n plumbing are exactly where a hand-rolled implementation costs weeks and creates security holes, so the rule is kit first: the office is the kit `Organization` (ADR 0008), agents join through the kit's invitation flow, the platform admin creates offices in the kit's `/admin/organizations`, and Nhịp's auth changes are config flags (`enableSignup: false`, `hideOrganization: true`, `enableUsersToCreateOrganizations: false`) plus one `hooks.before` middleware in `packages/auth/auth.ts` that refuses a second office. The seed uses the kit's `createUser` and `ensureOrganizationMembership`. The cost is a tree you have to know how to ignore (marketing, docs, payments, storage), kit-shaped naming (`supastarter` database, Organization meaning office), and version churn from the kit's changelog. The one subtree I removed was Drizzle, because it carried a third copy of the inbox vocabulary that competed with the zod enums; unused is tolerable, misleading is not.

</details>

**Follow-up:** Name one place where the kit's default behaviour was actively wrong for Nhịp and you had to override it rather than configure it.

**A weak answer sounds like:** "It saved time on auth and UI." No mention of the office being the kit Organization, of what was configured versus hooked, or of what the large tree costs.

Sources: `package.json`, `packages/auth/config.ts`, `packages/auth/auth.ts:151-166`, `apps/saas/modules/shared/lib/walk-nav.ts`, `docs/adr/0008-office-is-the-tenant.md`, `docs/adr/0010-office-assignment.md`, `ARCHITECTURE.md:315-326`

### Walk me through what happens between a guest sending a WhatsApp message and an operator seeing a suggested reply on screen. Where does the request return, and what happens after it returns?

_Chapter: architecture_

<details><summary>Strong answer</summary>

Meta POSTs to /webhooks/whatsapp, which is a one-liner into handleInboundWebhook(pipe, request). The raw body is read as text first because the HMAC is over the raw bytes; verifyInbound fails closed, so a missing WHATSAPP_APP_SECRET is a 403 for everything. The body is parsed loosely with zod, each entry individually, into InboundEvent[]. ingestEvents maps phone_number_id to an office via inbox_pipe_connection; no connection means the event is dropped and logged, never filed under nobody. upsertInbound runs one interactive transaction: find-or-create the thread by (office, pipe, guest), skip a duplicate vendorMessageId, insert the message. Then afterGuestInbound runs the synchronous regex one-shot: language, extraction, template reply, written to three side tables. At that point the route returns { ok: true }. Translation into en and vi, and a model follow-up if the office already sent, run as untracked promises in runInBackground. The Inbox client polls GET /api/conversations?locale= every 10 seconds through TanStack Query, so the operator sees the template immediately on the next poll and the translation and model draft one or two polls later.

</details>

**Follow-up:** What is the latency budget on that webhook response, and what would Meta do if the model call sat inside the request?

**A weak answer sounds like:** Describes the webhook writing a message and the UI fetching it, with no mention of signature verification, the pipe-to-office mapping, the synchronous versus background split, or that polling is how the async results arrive.

Sources: `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/modules/inbox/lib/inbox.ts:67-118`, `packages/database/inbox/store.ts:251-310`, `apps/saas/modules/inbox/lib/background.ts`, `apps/saas/modules/inbox/lib/inbox-queries.ts:15-41`

### What is the tenant in Nhịp, and how does a request find out which tenant it belongs to?

_Chapter: data_

<details><summary>Strong answer</summary>

The tenant is the office, which is the supastarter kit's Organization row (ADR 0008). I did not build a separate tenancy model; the kit's organization, member and invitation tables are the office and its agents. Every inbox route starts with requireInboxSession: auth.api.getSession gives 401 without a session, then resolveOffice(userId) reads getOrganizationMembershipsForUser from the member table on every request. Zero rows is 403 no_office, more than one is 403 ambiguous_office and a console.warn that ops has to fix, exactly one yields an InboxViewer { userId, officeId }. That viewer is passed into every store read: listConversations filters where officeId, getConversation returns null when the office does not match, so another office's thread is indistinguishable from a missing one. Home does the same thing server-side in loadHomeFunnel. A Better Auth before hook refuses accept-invitation for anyone already in an office (ONE_OFFICE_PER_OPERATOR) so the membership table cannot get into the ambiguous state through the normal flow.

</details>

**Follow-up:** That is one extra membership query per request. Why not cache it in the session, and what would it take to support an operator in two offices?

**A weak answer sounds like:** Says the tenant is the organization and the app reads the current organization from the session, which is the kit's default and exactly what this codebase refuses to do.

Sources: `apps/saas/modules/inbox/lib/office.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `packages/database/inbox/store.ts:222-240`, `packages/auth/auth.ts:150-165`, `docs/adr/0008-office-is-the-tenant.md`

## Core

### Explain "Your turn". Why is there no dismiss button, and how exactly is the state computed?

_Chapter: product_

<details><summary>Strong answer</summary>

Your turn means the guest spoke last: a fact, not a judgment. Whether a closing "thanks, talk Monday" needs a reply is something Nhịp cannot know, and a dismiss button would let an agent shrink the queue without a send or a real outcome, which makes the funnel lie (ADR 0004). So the queue empties only through sends and, later, CRM outcomes; after 48 hours a Your-turn thread folds into a collapsed Quiet section but still counts in the tab (`QUIET_AFTER_MS`, `buildQueueView`). In code it is `unansweredInboundId !== null`, derived in `store.ts:mapConversation`: walk back to the guest's latest inbound; it is unanswered unless an Answer with status in `ANSWERING_STATUSES = ["sending","sent","unknown"]` targets it, or an `oa-echo` outbound (agent replied from the vendor app) follows it. Since ADR 0011 this is derived from Answers, not message order, because a guest message that lands mid-send must not be hidden by the outbound answering the previous one. The accepted cost: an office with no CRM has no outcome path, so its quiet section grows.

</details>

**Follow-up:** A send failed at the vendor. Where does that thread sit in the queue, and why is `failed` treated differently from `unknown` there?

**A weak answer sounds like:** "Your turn is like an unread badge; the thread has a needs-reply flag that flips on send." Treats it as stored state, doesn't know it's derived from Answers, and would happily add a dismiss.

Sources: `docs/adr/0004-your-turn-queue.md`, `docs/adr/0011-answer-is-the-record-of-a-send.md`, `packages/database/inbox/store.ts:65,136-203`, `apps/saas/modules/inbox/lib/queue.ts`, `apps/saas/modules/inbox/components/ThreadList.tsx:95-112`

### Walk me from an HTTP request to `/api/conversations` down to the store query. Why do you not use the session's active organization for tenancy, when the kit does?

_Chapter: security_

<details><summary>Strong answer</summary>

The inbox routes live outside the `(authenticated)` layout and outside oRPC, so each handler starts with `requireInboxSession`. It calls `auth.api.getSession` and returns 401 without a session, then `resolveOffice(userId)`, which does one `member.findMany`: zero rows is 403 `no_office`, more than one is 403 `ambiguous_office`, exactly one gives a viewer `{ userId, officeId }`. Every store read takes that viewer: `listConversations` filters `where: { officeId }` and `getConversation` returns null when the office differs, so another office's thread is a 404 with no existence leak. I never read `session.activeOrganizationId` because the kit copies it from `user.lastActiveOrganizationId` in the `session.create.before` hook, and that is an additional user field the signed-in user can write through `/api/auth/update-user`. The 2026-09-20 audit's critical finding showed the first tenancy gate trusted it: set it to a victim office id, sign in again, read and approve their threads. ADR 0010: a preference cannot grant access. Reading membership per request also means revocation is immediate. Home's server component uses the same `resolveOffice`, so there is one definition of "which office". Cost: one extra query per request, and no multi-office operator until a later ADR.

</details>

**Follow-up:** The kit's own `(authenticated)/layout.tsx` still reads `activeOrganizationId` for its Permix role. Is that a hole, and why or why not?

**A weak answer sounds like:** "We check the session and use the active org from Better Auth's organization plugin." That is precisely the exploitable path the audit found.

Sources: `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/inbox/lib/office.ts`, `packages/auth/auth.ts:87-99`, `packages/auth/auth.ts:196-206`, `packages/database/inbox/store.ts:231-249`, `apps/saas/modules/inbox/lib/require-session.test.ts`, `docs/adr/0010-office-assignment.md`, `reports/2026-09-20-gpt6-astra-architecture-audit.md`

### Define the five funnel stages, show me how the three you compute map to SQL, and tell me why response time is not the headline.

_Chapter: product_

<details><summary>Strong answer</summary>

Agencies judge themselves on how many clients they interacted with and how many closings they got, not on seconds to first reply; response time is a means, the funnel is the end (ADR 0002), so it is a widget under the funnel. The cohort is leads whose first inbound landed in a fixed 30-day window (`FUNNEL_WINDOW_DAYS`), so the funnel narrows monotonically and never widens. `store.funnel` is one `$queryRaw`: CTE `first` = `MIN(at)` over `inbox_message WHERE direction='in'` per conversation; CTE `reached` = `MIN(sentAt)` over `inbox_answer WHERE status='sent'`; the outer select is scoped `WHERE c.officeId = $office AND firstInboundAt >= $since` and adds `EXISTS (later inbound with at > firstSentAt)` as `wroteBack`. Leads in is the row count, engaged is rows with a `firstSentAt`, in conversation is engaged rows with `wroteBack`. Only nearest-rank median and p90 are done in JavaScript. Closings and lost are not in the `Funnel` schema at all; `Home.tsx` renders them from `FROM_CRM` with "Connect your CRM", never a zero, because outcomes come from the office's CRM and are never inferred from chat (ADR 0003). A correction to the chapter's source: CONTEXT.md says engaged is an "approved send"; the code counts only `sent`, so a failed or unknown Answer does not engage.

</details>

**Follow-up:** Home is visible to every operator with no role check. Was that a shortcut or a decision, and what would have to change for it to become a problem?

**A weak answer sounds like:** "We show median reply time and number of leads; closings are a count of threads marked won." No cohort rule, no idea that closings come only from the CRM, no SQL.

Sources: `docs/adr/0002-home-shows-the-funnel.md`, `docs/adr/0003-crm-adapter.md`, `packages/database/inbox/store.ts:513-564`, `apps/saas/modules/home/lib/funnel.ts`, `apps/saas/modules/home/components/Home.tsx:14-15,148-155`, `packages/database/inbox/schema.ts:65-94`, `apps/saas/modules/inbox/lib/funnel.test.ts`, `CONTEXT.md`

### The kit ships oRPC procedures behind Hono. Why are the inbox, webhook and dev routes plain Next route handlers instead?

_Chapter: tools_

<details><summary>Strong answer</summary>

Three reasons, each concrete. Webhooks need the raw body as bytes for the HMAC (`request.text()` in `pipes/webhook.ts`) and vendor headers, and Meta's GET handshake returns plain text, none of which fits an RPC procedure. The approve route maps domain results to specific HTTP codes: 409 `stale_target`, 400 `empty_reply`, 502 `send_failed`, 502 `delivery_unknown`, 500 `record_failed`; that is an HTTP contract, not a typed RPC return. And the session gate has to resolve the office from the membership table (ADR 0010), which is a different context shape from the kit's `protectedProcedure`, which sets Permix rules from the session. Static segments like `/api/conversations` match before the `[[...rest]]` catch-all, so Hono never sees them. The cost is real and I found it the hard way: the 2026-09-06 audit showed those routes were unauthenticated because nothing gated them, and the fix was `requireInboxSession` with its own test rather than moving them into oRPC. The other cost is no generated client types; `inbox-queries.ts` is hand-written `fetch` with an `InboxApiError` that carries the server's error code to the UI.

</details>

**Follow-up:** If you added a third inbox endpoint tomorrow, what stops the next developer from forgetting the gate, given there is no layout or middleware enforcing it?

**A weak answer sounds like:** "They're just API routes, Next makes that easy." Doesn't know the catch-all ordering, that the routes were once unauthenticated, or why raw bodies matter for signatures.

Sources: `packages/api/index.ts`, `packages/api/orpc/procedures.ts`, `apps/saas/app/api/[[...rest]]/route.ts`, `apps/saas/app/api/conversations/[id]/approve/route.ts`, `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/inbox/lib/inbox-queries.ts`, `reports/2026-09-06-handoff-analysis.md:48`

### A signed WhatsApp webhook arrives for a phone_number_id no office has connected. Trace it, and tell me why you answer the way you do.

_Chapter: security_

<details><summary>Strong answer</summary>

`handleInboundWebhook("whatsapp", request)` reads the raw body first, then `verifyWhatsAppSignature` checks `X-Hub-Signature-256` as HMAC-SHA256 of those bytes with `WHATSAPP_APP_SECRET`, comparing with `crypto.timingSafeEqual` after a hex and length check. It fails closed: no secret or no header is a 403 before any parsing, so a misconfigured deploy rejects everything rather than accepting everything (the 2026-09-06 audit found Zalo's secret was documented but never read). Only then is the body parsed with deliberately loose zod schemas, one entry at a time, so one malformed entry does not sink the batch. `ingestEvents` takes each event's `pipeExternalId` (Meta's `metadata.phone_number_id`) and calls `store.officeForPipe`; with no `PipeConnection` row it logs `inbound dropped, no office owns this pipe` and continues, and the route still returns 200. The 200 is deliberate: a non-2xx makes Meta retry a message that can never be filed, and filing it under a default or unowned office is exactly the visible-to-everyone fallback ADR 0012 removed. Every thread has an office from birth. The cost I own: a forgotten `pipe:connect` loses guest messages with only a warn line as evidence.

</details>

**Follow-up:** Given that a forgotten pipe:connect silently loses messages, what would you add before the first real office goes live, and where would it live?

**A weak answer sounds like:** "We verify the signature and create the conversation; if there's no office we'd assign it to a default one or return an error." Both options are the ones the code refuses.

Sources: `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:209-260`, `apps/saas/modules/inbox/lib/pipes/index.ts:20-36`, `apps/saas/modules/inbox/lib/inbox.ts:91-113`, `apps/saas/modules/inbox/lib/pipes/webhook.test.ts`, `packages/database/prisma/schema.prisma:402-411`, `apps/saas/modules/inbox/scripts/connect-pipe.ts`, `docs/adr/0012-inbox-on-prisma.md`

### An outside audit told you to keep SQLite and add a migration ledger. You moved the inbox into the kit's Postgres under Prisma instead. Why, and what did it cost?

_Chapter: tools_

<details><summary>Strong answer</summary>

The audit's item was really about lifecycle across two stores: an office row in Postgres could not cascade to its threads in a SQLite file, so office deletion, membership and pipe ownership all needed hand-written cross-store code plus a version ledger. ADR 0012 names the three costs that forced the move: no relations across the line, two schema tools, and one-process-one-disk. Now `Conversation.officeId` and `PipeConnection.officeId` reference `Organization` with `onDelete: Cascade`, `Answer.operatorId` is `SetNull` so the record of a send outlives the account, the unique key is `(officeId, pipe, guestId)`, and the store is the only writer. Prisma 7 with the `prisma-client` generator, `engineType = "client"` and `adapter-pg`, so no Rust engine and a lazy Proxy singleton for hot reload. What it cost: tests and CI need a live Postgres (`supastarter_test`, files run serially because they truncate), `db push` is the dev path with no migration history yet, so a `migrate` baseline is a go-live step, and `seq` autoincrement columns exist only for ordering. What it did not close: office delete still leaves operators' `User` rows behind; that is a separate ADR.

</details>

**Follow-up:** Your unique-index race test and the raw funnel SQL cannot run against a mock. Is that the real reason for a live Postgres in CI, or a rationalisation after the fact?

**A weak answer sounds like:** "SQLite doesn't scale, Postgres is production-grade." Generic; misses that the actual problem was cascades and two schema tools, and doesn't mention db push versus migrate.

Sources: `docs/adr/0012-inbox-on-prisma.md`, `packages/database/prisma/schema.prisma:289-310,377-411`, `packages/database/prisma/client.ts`, `packages/database/package.json`, `apps/saas/vitest.global-setup.ts`, `packages/database/inbox/testing.ts`, `reports/2026-09-20-gpt6-astra-architecture-audit.md`

### Why is the Answer row written in status sending before the vendor is called, rather than recording the send after the vendor acknowledges it? What went wrong with the earlier design?

_Chapter: data_

<details><summary>Strong answer</summary>

The earlier design had an Approval row and a Send row written after the vendor call, with a claimedAt on the message. An outside audit found three gaps. First, the approval carried only a thread id and text, so if the guest wrote again between drafting and tapping, the reply meant for message N went out as the answer to message N+1. Second, one try/catch covered both the vendor call and the record write, so a vendor success followed by a record failure released the claim and the retry sent the text twice. Third, Your turn was read off message order, so a guest message that landed mid-send was hidden by the outbound stored after it. ADR 0011 collapsed all of that into one Answer row per guest message, unique on inboundId, written in status sending inside beginAnswer before transmit runs. The approval now names its target, so a mismatch is 409 stale_target. Because the row exists before the vendor call, a record failure after vendor success leaves an unknown row that blocks any resend. And Your turn is derived from Answers, so the mid-send guest message stays in the queue. Failure handling is split by kind: SendError is definite and marks failed, which can be retried on the same row; anything else marks unknown and a human reconciles.

</details>

**Follow-up:** A sending row left behind by a crashed process blocks that message forever. How would you detect and clear it, and would you automate that?

**A weak answer sounds like:** Explains that you should write to the database before external calls for durability, without naming the three concrete bugs, the unique index, or the distinction between failed and unknown.

Sources: `docs/adr/0011-answer-is-the-record-of-a-send.md`, `apps/saas/modules/inbox/lib/inbox.ts:200-330`, `packages/database/inbox/store.ts:362-420`, `packages/database/prisma/schema.prisma:375-400`, `apps/saas/modules/inbox/lib/approve.test.ts:223-313`

### You chose 10-second polling over websockets or SSE for the inbox. Defend that, and tell me what it costs and when you would replace it.

_Chapter: architecture_

<details><summary>Strong answer</summary>

Polling is the delivery mechanism for everything that happens without the operator: new inbounds, translations landing, model drafts landing. All of those are already asynchronous with seconds of model latency, so a 10-second poll adds no meaningful delay to a process that takes 5 to 30 seconds anyway. An office has a few operators and a list of threads that fits in one findMany with one include, so the refetch is cheap. It needs no connection state, no pub/sub, no sticky sessions, and works on any host. Mutations do not wait for the poll: useApproveAndSend and useRegenerateDraft invalidate the ["inbox","conversations"] key on success so the list refetches immediately. The costs are honest: up to 10 seconds of latency for a fresh inbound, every open tab refetching even when nothing changed, and GET /api/conversations loading every message and answer of every thread in the office on each poll because CONVERSATION_INCLUDE is the only read shape. That last one is the real scaling limit, not the poll itself. I would replace polling with SSE or a push from the webhook handler when either offices get large enough that the list query is noticeable, or when the product needs sub-second notification for a guest waiting on chat.

</details>

**Follow-up:** Every poll also calls scheduleMissingTranslations over every message. What happens to that when the model keeps returning null for one message?

**A weak answer sounds like:** Says polling was simpler to build and websockets would be better, without connecting it to the background job model, cache invalidation on mutation, or naming the include-everything query as the actual cost.

Sources: `apps/saas/modules/inbox/lib/inbox-queries.ts`, `apps/saas/app/api/conversations/route.ts`, `packages/database/inbox/store.ts:51-57`, `packages/database/inbox/store.ts:222-229`, `docs/adr/0007-translate-guest-messages.md`

### Why did you move the inbox from a SQLite file into the kit's Postgres through Prisma, and what did you give up?

_Chapter: data_

<details><summary>Strong answer</summary>

The inbox started as a better-sqlite3 file next to the kit's Postgres with hand-written DDL run on open. Three costs grew until the move became worth it. Threads carried the office id as text with no foreign key across the database line, so deleting an office left its threads behind. Every schema change was two tools: prisma db push for the kit and a hand migration with its own test for the inbox. And a file on one disk ruled out serverless and any second instance. ADR 0012 moved the eight models into schema.prisma with an inbox_ prefix, real cascades from Organization and set-null from User, and one DATABASE_URL. Because everything above the store spoke the InboxStore interface, no route, no approve path, no component and no seed changed; the existing approve, loop and funnel tests were the proof, which is why the funnel landed first. What I gave up: synchronous transactions, so the approve race now rests on the unique index inside an async interactive transaction; zero-setup tests, since a temp file became a second Postgres database with a global db push and serial test files; and the migrate-on-open path for old files, dropped outright because there was no production data. A prisma migrate baseline is still owed before go-live; development runs on db push.

</details>

**Follow-up:** You are on db push in dev with no migration history. Walk me through the first destructive schema change after there is production data.

**A weak answer sounds like:** Says Postgres is more scalable than SQLite and Prisma gives type safety, without the foreign-key problem, the two-schema-tool problem, or what the seam bought during the move.

Sources: `docs/adr/0012-inbox-on-prisma.md`, `packages/database/inbox/types.ts:182-221`, `packages/database/prisma/schema.prisma:251-411`, `apps/saas/vitest.global-setup.ts`, `apps/saas/vitest.config.ts`

### Describe the background job model. There is no queue. What happens when the process dies mid-job, and why is that acceptable?

_Chapter: ai_

<details><summary>Strong answer</summary>

background.ts is 25 lines: runInBackground wraps a promise, catches any error into console.warn, removes itself from a module-level Set on finally, and returns the job. settleBackgroundWork loops until the Set is empty, which also catches jobs started by other jobs; that is the test synchronisation primitive. There is no persistence, no retry, no cross-instance dedupe. The reason it is acceptable is ordering: the fallback is written to disk before any job starts. The one-shot template is already in the reply box, the original guest text is already visible, and then the route returns. A lost translation job is a degraded state, not a wrong one, and GET /api/conversations?locale= backfills it through scheduleMissingTranslations on the next read. A lost follow-up draft leaves the follow-up template, which is a valid state, and the operator can hit Regenerate. Where it bites: two instances could translate the same message twice because inFlight is per process, which is harmless since setTranslation upserts; and a platform that freezes the function after the response would lose these jobs routinely, which is one reason ADR 0012 assumes a long-lived Node process. The upgrade path is pg-boss on the same Postgres when I need retries or a second instance.

</details>

**Follow-up:** If you added pg-boss tomorrow, which job would you move first and what would you have to change in the tests?

**A weak answer sounds like:** Says jobs run async with fire-and-forget promises and admits you could lose them, without explaining why the fallback-first ordering makes that safe or naming the serverless constraint.

Sources: `apps/saas/modules/inbox/lib/background.ts`, `apps/saas/modules/inbox/lib/translate.ts`, `apps/saas/modules/inbox/lib/inbox.ts:78-92`, `apps/saas/app/api/conversations/route.ts`, `docs/adr/0007-translate-guest-messages.md`

### You put a regex post-check behind the model draft even though the system prompt already forbids paperwork claims. Why both, and what does that post-check deliberately get wrong?

_Chapter: ai_

<details><summary>Strong answer</summary>

The prompt carries the rules; guardrails.ts is the part that does not trust the prompt. A model's compliance with a rule is probable, a regex is certain, and the asymmetry of costs settles it: a dropped good draft costs a template in the box, a leaked promise about a pink book or a visa costs the office a legal problem with a foreign buyer. checkFollowUp returns null for empty text, for anything over 600 characters because one to three sentences is the agent's register, and for any match of PAPERWORK_TERMS, a case-insensitive Unicode regex over pink book, sổ hồng, sổ đỏ with and without diacritics, ownership, residency, visa, work permit, and the Korean, Japanese and Russian equivalents. It is substring matching, not word-bounded, so it is deliberately over-eager: advisable matches visa, co-ownership matches ownership, and those drafts are dropped too. That is the intended direction of failure. What it does not check is the other ADR 0005 rule, never state a price or availability the agent has not written; that lives only in the prompt because there is no listing data to compare against. There is also a structural layer under both: nothing in drafts/, translate.ts or the draft route can call transmit. A draft only ever lands in inbox_draft; sending is a separate human action that writes an Answer first.

</details>

**Follow-up:** How would you measure the false-positive rate of that regex, and at what rate would you switch to word boundaries or a judge call?

**A weak answer sounds like:** Says the prompt tells the model not to discuss legal matters and there is validation on the output, without the cost asymmetry argument, the over-eager substring choice, or the missing listing-fact check.

Sources: `apps/saas/modules/inbox/lib/drafts/guardrails.ts`, `apps/saas/modules/inbox/lib/drafts/prompts.ts`, `apps/saas/modules/inbox/lib/inbox.ts:37-66`, `docs/adr/0005-ai-suggested-reply.md`, `apps/saas/modules/inbox/lib/loop.test.ts`

### Why a hand-written fetch to a chat-completions endpoint with OpenRouter as the default, when the kit already ships the Vercel AI SDK with Anthropic and OpenAI providers? What is the cost model?

_Chapter: ai_

<details><summary>Strong answer</summary>

The protocol I need is a POST with three fields and a response I read one field from. openai-compatible.ts sends model, max_tokens, temperature 0.2 and two messages, with a 30-second AbortSignal timeout, and a zod schema that reads only choices[0].message.content and finish_reason. A hand-written client cannot drift with a vendor package, and one class of endpoint covers OpenRouter, Groq, DeepSeek, Gemini, OpenAI, Mistral or a local Ollama, which config.test.ts exercises at localhost:11434. Provider and model are configuration: DRAFT_API_KEY, DRAFT_MODEL, DRAFT_BASE_URL. DRAFT_MODEL is required when the key is set because a model id defaulted in code goes stale; a key alone is a misconfiguration and production throws at startup. Every failure path returns null and the fallback stands, and the warn log carries the model id and status but never the guest text. The cost model is deliberately simple: the prepaid OpenRouter balance is the budget, there is no per-office metering or token accounting, and the per-inbound cost is zero model calls for the one-shot, up to two translation calls into en and vi, and one follow-up only when the guest writes back after a send. ADR 0007 says one call per inbound; the code makes up to two because both operator languages are translated eagerly. I gave up streaming, structured outputs and prompt caching, none of which a three-sentence reply needs.

</details>

**Follow-up:** Your ADRs call for an evaluation set before the first reply moves from template to model. Where is it?

**A weak answer sounds like:** Says the AI SDK was overkill and OpenRouter is convenient, without the no-drift argument, why DRAFT_MODEL has no default, or an honest count of calls per inbound.

Sources: `apps/saas/modules/inbox/lib/drafts/openai-compatible.ts`, `apps/saas/modules/inbox/lib/drafts/index.ts`, `apps/saas/modules/inbox/lib/config.ts`, `apps/saas/modules/inbox/lib/translate.ts:55-60`, `.env.local.example:105-114`, `docs/adr/0005-ai-suggested-reply.md`

## Hard

### Two agents tap Approve on the same guest message within the same 50 ms. Walk me through every branch of `approveAndSend`, then tell me where it is still not airtight.

_Chapter: security_

<details><summary>Strong answer</summary>

Both requests pass the viewer-scoped load, the `inboundId` and `stale_target` checks, the WhatsApp window and `ownsEndpoint`. Then each calls `store.beginAnswer`, a `$transaction` that does `findUnique` on `inboundId` and `create` in status `sending`. The unique index on `Answer.inboundId` lets one create through; the other gets Prisma `P2002`, duck-typed as `isUniqueViolation`, returned as `in_progress`, and surfaces as 409 `send_in_progress`. `approve.test.ts:528` asserts `[200, 409]` and one Answer. Only after the row is committed does `transmit` run. A `SendError` (vendor refused, missing credentials) calls `failAnswer`, an `updateMany` guarded by `status: "sending"`, and the same row may be retried. Any other throw is `unknown`, never auto-retried. A vendor success whose `completeAnswer` fails is also marked `unknown` and returns 500 `record_failed`. Where it is not airtight, and the chapter does not say this: the retry path. If the Answer is already `failed`, two concurrent retries both read `failed` under Postgres's default Read Committed (no `isolationLevel` is set), both do `update where { id }`, both return `ok`, and both transmit. The unique index does not help because the row exists. The fix is a conditional `updateMany where { id, status: "failed" }` treating count 0 as `in_progress`, or `SELECT ... FOR UPDATE`, or Serializable on that transaction.

</details>

**Follow-up:** You chose to freeze `unknown` rather than retry with a vendor idempotency key. Meta does not offer one for messages; Zalo does not either. Would you still freeze if they did, and who reconciles today?

**A weak answer sounds like:** "We wrap the send in a try/catch and mark it sent after; the database transaction prevents double sends." That is the pre-ADR-0011 design the audit reproduced as a double send, and it doesn't know the row is written before the vendor call.

Sources: `apps/saas/modules/inbox/lib/inbox.ts:209-339`, `packages/database/inbox/store.ts:362-420`, `packages/database/inbox/store.ts:463-480`, `packages/database/prisma/schema.prisma:377-400`, `apps/saas/modules/inbox/lib/approve.test.ts:241-249,528-536`, `docs/adr/0011-answer-is-the-record-of-a-send.md`

### Vendor credentials are process-wide. A second agency signs next month with its own WhatsApp number. What breaks, what is the guard today, and what is the smallest change?

_Chapter: security_

<details><summary>Strong answer</summary>

Receiving works: `pipe:connect` maps the second phone_number_id to the second office, webhooks are verified with the same app secret (one Meta app can own several numbers), and threads file under the right office. Sending breaks: `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are one pair on the process, so a reply for office B would leave through office A's number. The guard is ADR 0010's `ownsEndpoint`: `approveAndSend` reads the last inbound's `pipeExternalId` and, when `sendMode === "live"`, refuses with 409 `pipe_not_configured` unless it equals the configured phone number id (for Zalo, unless `ZALO_OA_ID` is unset or equal). So office B's threads are readable but unanswerable; nothing is recorded. The audit called per-connection credentials the smallest real fix and I deferred it because the pilot is one agency. The seam is already there: `PipeConnection` maps endpoint to office but carries no token; `PipeAdapter.ownsEndpoint` and `send` both take `config`. The change is a token column on `PipeConnection` (encrypted at rest), `transmit` looking up the connection by the thread's `pipeExternalId` instead of process config, and the startup validation relaxing its five-secret requirement. Routes do not change.

</details>

**Follow-up:** Where would you store those per-connection tokens, who can rotate them, and how does startup validation know the deploy is healthy when secrets live in the database?

**A weak answer sounds like:** "Each office gets its own env vars or its own deployment." Doesn't know the 409 guard exists or that the adapter interface already takes config per call.

Sources: `apps/saas/modules/inbox/lib/pipes/index.ts:20-75`, `apps/saas/modules/inbox/lib/inbox.ts:153-162,250-262`, `apps/saas/modules/inbox/lib/config.ts:56-70,157-185`, `apps/saas/modules/inbox/lib/approve.test.ts:539-570`, `packages/database/prisma/schema.prisma:402-411`, `docs/adr/0010-office-assignment.md`, `reports/2026-09-20-gpt6-astra-architecture-audit.md`

### What actually goes to the language model, what stays regex, what does the guardrail stop, and where is the cost lever?

_Chapter: tools_

<details><summary>Strong answer</summary>

Regex does everything on the hot path: language detection, the seven-field qualification and the paperwork flag (`oneShot`), and the first reply is a template keyed on language and facts. The model is behind one `DraftAdapter` with two providers, `none` and `openai-compatible`, a plain fetch to a chat-completions endpoint, OpenRouter by default, `DRAFT_MODEL` chosen per deploy for the cheapest model that handles VI/JA/KO/RU. Two things call it, both in the background so a webhook returns immediately: translation, once per inbound per operator locale, deduped by an in-flight map and skipped when the message is already in that locale; and the follow-up draft, only once a thread has a `sentAt` and only from the whole conversation. With no `DRAFT_API_KEY` nothing runs and the template stands. The guardrail `checkFollowUp` is a 600-character cap plus a paperwork and ownership regex in six scripts; a hit drops the draft and the template stands. `generateModelDraft` also rechecks `unansweredInboundId` before writing so a slow draft never lands on a newer guest message. `asData` strips framing tags from guest text and names. What it does not stop, audit finding 8: an invented viewing time or price passes; the human approval is the backstop. Cost lever: `scheduleTranslations` runs for both `en` and `vi` on every inbound though an office typically has one operator locale.

</details>

**Follow-up:** Why is the first reply still a template when you have a model available, and what evidence would make you flip it?

**A weak answer sounds like:** "We send the message to GPT with a prompt and show the answer." No seam, no idea what stays regex, no stale-draft check, and thinks the keyword list is a safety guarantee.

Sources: `apps/saas/modules/inbox/lib/draft.ts`, `apps/saas/modules/inbox/lib/inbox.ts:9-85`, `apps/saas/modules/inbox/lib/translate.ts`, `apps/saas/modules/inbox/lib/background.ts`, `apps/saas/modules/inbox/lib/drafts/adapter.ts`, `apps/saas/modules/inbox/lib/drafts/guardrails.ts`, `apps/saas/modules/inbox/lib/drafts/prompts.ts:17-23,58`, `apps/saas/modules/inbox/lib/config.ts:174-188`, `docs/adr/0005-ai-suggested-reply.md`, `docs/adr/0007-translate-guest-messages.md`

### Give me three ways Home's numbers can be wrong today, in the code as it stands, and rank them by how much a manager would care.

_Chapter: product_

<details><summary>Strong answer</summary>

First, and the chapter does not mention it: replies from the vendor app. When an agent answers from the WhatsApp or Zalo phone app, the echo arrives as an `oa-echo` outbound Message, which correctly clears Your turn in `mapConversation`, but it writes no Answer row. The funnel's `reached` CTE reads only `inbox_answer WHERE status='sent'`, so that lead is never engaged, never in conversation, and excluded from response time. An office that half-works from the phone under-reports itself and the manager concludes the tool is not being used. Second, mock Answers count: `completeAnswer` stores `mock: true` but the SQL never filters on it, so once live and mock coexist on one database, demo sends inflate engaged. Third, time: the cohort is a rolling 30 days from `Date.now()` with no office timezone and no picker, so a guest who first wrote 40 days ago and was answered yesterday is invisible, and "this month" never lines up with the office's month. Smaller: CONTEXT says engaged is an approved send while the code counts only `sent`, and `later.at > firstSentAt` uses vendor timestamps that a dev injection can backdate. I would fix the first by counting `oa-echo` outbounds as engagement with a distinct source, since the office did reply.

</details>

**Follow-up:** For the oa-echo case, should a reply from the phone app count as engaged when the manager is paying for replies through Nhịp? Who decides, and what does the funnel then measure?

**A weak answer sounds like:** "The numbers come straight from the database so they're accurate; maybe timezone." Cannot name the oa-echo gap or the mock flag, doesn't know the cohort rule.

Sources: `packages/database/inbox/store.ts:136-186`, `packages/database/inbox/store.ts:513-564`, `packages/database/inbox/store.ts:430-461`, `apps/saas/modules/home/lib/funnel.ts`, `apps/saas/modules/inbox/lib/funnel.test.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts`, `CONTEXT.md`, `docs/adr/0002-home-shows-the-funnel.md`

### Two operators tap Approve on the same guest message within the same millisecond. Trace exactly which mechanism lets one through, and tell me which mechanism people assume does it but does not.

_Chapter: data_

<details><summary>Strong answer</summary>

Both requests pass the gate, both load the conversation and see the same unansweredInboundId, both reach beginAnswer. beginAnswer opens a Prisma interactive transaction, loads the inbound, does findUnique on Answer by inboundId, sees nothing, and calls create. People assume the transaction serialises this. It does not: Postgres defaults to READ COMMITTED, so both transactions can see no Answer yet and both reach the insert. What closes the race is the @unique on Answer.inboundId. The second insert blocks on the index until the first commits, then fails with P2002. That is why the catch is outside the transaction: isUniqueViolation duck-types error.code === "P2002" and returns { ok: false, reason: "in_progress" }, the same reason the sequential path returns when it finds a sending row, so the caller cannot tell the two apart and does not need to. approveAndSend maps it to 409 send_in_progress. The proofs are store.test.ts with Promise.all of two beginAnswer calls asserting outcomes ["in_progress","ok"] and one row, and approve.test.ts through the real route asserting [200, 409] and one nhip message. ADR 0012 phrases it as the transaction plus the index; strictly the transaction is there because the message id and the retry-on-failed path depend on the read, and the index carries the concurrency. Note the contrast with webhook dedupe: upsertInbound's vendorMessageId check is a findFirst with no unique index, so it is not race-safe the same way.

</details>

**Follow-up:** So a duplicate webhook delivered twice concurrently could insert the same guest message twice. How bad is that and what would you add?

**A weak answer sounds like:** Says the operation is wrapped in a database transaction so only one can succeed, which is the wrong mechanism under READ COMMITTED and misses the P2002 mapping.

Sources: `packages/database/inbox/store.ts:205-210`, `packages/database/inbox/store.ts:362-420`, `packages/database/inbox/store.ts:276-283`, `packages/database/prisma/schema.prisma:379-380`, `apps/saas/modules/inbox/lib/store.test.ts:38-48`, `apps/saas/modules/inbox/lib/approve.test.ts:528-536`, `docs/adr/0012-inbox-on-prisma.md`

### The funnel is one raw SQL query cohorted by first inbound. Why cohort instead of counting each stage by its own event date, and where does that query lie or get expensive?

_Chapter: data_

<details><summary>Strong answer</summary>

store.funnel is a $queryRaw tagged template so officeId and since are bound parameters. Two CTEs: first takes MIN(at) of direction = 'in' per conversation, reached takes MIN(sentAt) of inbox_answer where status = 'sent' per conversation. The select joins conversation to first, left-joins reached, and computes wroteBack as an EXISTS for a later inbound with at greater than firstSentAt, filtered by officeId and firstInboundAt >= since. One row per cohort lead, and JavaScript only sorts the durations and takes nearest-rank percentiles, sorted[ceil(p*n)-1], never interpolated. The cohort rule exists because a funnel must narrow monotonically: leads >= engaged >= inConversation. If each stage were counted by its own event date, a guest who wrote 40 days ago and was answered this week would count as engaged but not as a lead, and the funnel could widen. failed and unknown Answers never count as reached. Where it is imperfect: wroteBack compares a message at, which is the vendor timestamp, against sentAt, which is the server clock at completeAnswer, so clock skew could miscount a write-back that arrived seconds after the send; the funnel test dates write-backs a minute ahead for that reason. And both CTEs scan all of inbox_message and inbox_answer before the office filter applies at the join, with only @@index([conversationId]) on message and no index on (direction, at). Fine at pilot scale, and the fix is a partial index or pushing officeId into the CTEs when an office is large enough to notice.

</details>

**Follow-up:** responseTime is null when nobody was answered, and closings and lost say connect your CRM. Why not zero, and who decided that?

**A weak answer sounds like:** Describes counting conversations with and without replies in the last 30 days, without the monotonic cohort argument, the two-clock issue, or the missing index.

Sources: `packages/database/inbox/store.ts:513-564`, `packages/database/inbox/store.ts:212-215`, `packages/database/prisma/schema.prisma:325-329`, `apps/saas/modules/inbox/lib/funnel.test.ts`, `apps/saas/modules/home/lib/funnel.ts`, `docs/adr/0002-home-shows-the-funnel.md`

### A live send times out after the vendor may or may not have delivered it. What is the state of the system, what does the operator see, and what would it take to make that self-healing?

_Chapter: architecture_

<details><summary>Strong answer</summary>

transmit threw something that is not a SendError, so approveAndSend calls markAnswerUnknown, an updateMany guarded by status = sending, and returns 502 delivery_unknown. The Answer row stays on file as unknown. On the next read, mapConversation counts unknown among ANSWERING_STATUSES, so unansweredInboundId is null and the thread leaves the Your turn queue even though no outbound message exists. sendStatusFor turns that into { kind: "unknown" } and the SendBar words it as a send whose delivery nobody confirmed. A second Approve hits hasUnknownAnswer and gets 409 delivery_unknown, not already_answered. If the guest writes again, a new inbound opens a new turn while the old unknown row stays. The same status covers a vendor success whose completeAnswer failed, marked recorded_failed:, because in both cases resending is worse than a human checking. There is no automatic retry and no reconciliation, by design for a pilot: the vendor may have delivered, and WhatsApp charges and the guest sees a duplicate if we guess wrong. To make it self-healing I would need an idempotency key on the vendor side, which WhatsApp Cloud API does not offer for free-form text, or a read-back: poll the vendor for message status, or match the delivery webhook that Meta sends on statuses to the Answer's vendorMessageId when we have one. For a sending row orphaned by a crash, a sweeper that marks sending rows older than the request timeout as unknown is the honest fix; today it blocks until someone edits the row.

</details>

**Follow-up:** Meta does send status webhooks. Why did you not wire those to the Answer, and what would change in the parser?

**A weak answer sounds like:** Says failed sends are retried or the operator can just send again, which is exactly what the unknown status forbids, and does not distinguish failed from unknown.

Sources: `apps/saas/modules/inbox/lib/inbox.ts:282-330`, `packages/database/inbox/store.ts:459-475`, `packages/database/inbox/store.ts:64-65`, `packages/database/inbox/store.ts:173-186`, `apps/saas/modules/inbox/lib/send-status.ts`, `apps/saas/modules/inbox/lib/inbox.ts:178-196`

### Both webhook signatures fail closed on a missing secret, and the WhatsApp GET handshake is a separate path. Walk me through the verification math for each vendor, why the raw body matters, and what an attacker who knows the pipe ids but not the secrets can do to this system.

_Chapter: architecture_

<details><summary>Strong answer</summary>

The route reads request.text() before anything parses, because both vendors sign the raw bytes; re-serialising JSON would change key order or whitespace and break the HMAC. WhatsApp sends X-Hub-Signature-256: sha256=<hex>, which is HMAC-SHA256 over the body with WHATSAPP_APP_SECRET. Zalo sends X-ZEvent-Signature: mac=<hex>, which is a plain sha256 of app_id + rawBody + timestamp + ZALO_OA_SECRET_KEY, with app_id and timestamp read from the body itself. Both compare with crypto.timingSafeEqual on the hex, and a missing secret returns false, so an unconfigured deployment answers 403 to every inbound rather than accepting unsigned traffic. The GET is Meta's one-time subscribe handshake: hub.mode=subscribe and hub.verify_token equal to WHATSAPP_VERIFY_TOKEN echoes hub.challenge, and it is separate because it carries no signature. Without the secrets an attacker can do nothing on the inbound path. With the WhatsApp secret, they can forge a guest message into any office whose phone_number_id they know, which would create a thread, run the one-shot, and spend two translation calls; they still cannot send, because sending is a human approval. Zalo's scheme is weaker: no timestamp window is enforced, so a captured payload replays indefinitely, and the vendorMessageId dedupe only catches an exact replay on the same thread. What I would add is a timestamp tolerance on Zalo and a unique index on (conversationId, vendorMessageId) so a concurrent replay cannot double-insert.

</details>

**Follow-up:** proxy.ts excludes webhooks from the locale middleware by a literal regex. What breaks if someone refactors that matcher into an import?

**A weak answer sounds like:** Says the webhooks check a signature header and reject bad ones, with no distinction between HMAC and plain sha256, no mention of the raw body, and no idea what a forged inbound could or could not cause.

Sources: `apps/saas/modules/inbox/lib/pipes/vendors.ts:200-260`, `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/modules/inbox/lib/pipes/index.ts:38-70`, `apps/saas/app/webhooks/whatsapp/route.ts`, `packages/database/inbox/store.ts:276-283`, `apps/saas/proxy.ts`

## Trap: the obvious answer is wrong here

### An agent opens a thread in the Quiet section on WhatsApp, edits the suggested reply, and taps Approve and send. What happens?

_Chapter: product_

<details><summary>Strong answer</summary>

It is refused with 409 `outside_24h_window`, and nothing is recorded. Quiet means the guest last wrote more than 48 hours ago (`QUIET_AFTER_MS`), and WhatsApp's customer-care window is 24 hours from the last guest inbound (`WA_WINDOW_MS`, `whatsappWindowState`, checked in `approveAndSend` before `beginAnswer`). Every quiet WhatsApp thread is by definition outside the window, so on WhatsApp the quiet section is not "reply when you get a chance", it is "waiting on the guest". Only Zalo quiet threads can be answered, because Zalo's `sendWindow` is always open. The reason is deliberate: outside the window Meta requires a paid, pre-approved template, and Nhịp v1 does not invent templates; nudges are deferred by ADR 0006 because they need template approval, a different queue state, and no pilot has asked. So the only exits for a quiet WhatsApp thread are the guest writing again or, once the CRM adapter exists, a won or lost outcome. That is the accepted consequence in ADR 0004, and it is also a UI gap I would fix: the reply box should say the window is closed before the agent types, not after.

</details>

**Follow-up:** Given that, is 48 hours the right quiet threshold for WhatsApp, or should quiet and the send window be the same number on that pipe?

**A weak answer sounds like:** "It sends, and the thread moves to Sent." The obvious answer, and wrong on the pipe that matters most; also anyone who says "we'd send a template" hasn't read ADR 0006.

Sources: `apps/saas/modules/inbox/lib/queue.ts:13-35`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:7-37`, `apps/saas/modules/inbox/lib/pipes/index.ts:42-63`, `apps/saas/modules/inbox/lib/inbox.ts:240-248`, `apps/saas/modules/inbox/lib/approve.test.ts:373-385`, `docs/adr/0004-your-turn-queue.md`, `docs/adr/0006-reply-only-per-message-approval.md`

### A live send to Meta timed out. The agent sees an error and taps Approve again. That retries the send, right?

_Chapter: security_

<details><summary>Strong answer</summary>

No. A timeout is not a `SendError`, so `approveAndSend` calls `markAnswerUnknown` and returns 502 `delivery_unknown`. On the second tap the thread has no open inbound, because `unknown` is in `ANSWERING_STATUSES`, so `unansweredInboundId` is null; `hasUnknownAnswer` is true and the reply is 409 `delivery_unknown`: "check whether it arrived before sending again." `beginAnswer` would also refuse an `unknown` row with reason `unknown`. This is the ADR 0011 rule: a vendor may have delivered the message even though we never saw the acknowledgement, and the pre-audit code retried on any exception, which reproduced as a double send. Only a definite failure, a `SendError` from a vendor refusal or missing credentials, marks `failed` and may be retried on the same row. The cost I accept and say out loud: there is no reconciliation UI. A person checks the vendor's message log and clears the row in the database; until then the operator sees 409 and the thread stays out of Your turn. What I would build next is a small admin action that takes the vendor's answer, sent or not, and moves the row to `sent` or `failed`.

</details>

**Follow-up:** A vendor success whose database write then fails also lands in `unknown`. How would an operator tell those two cases apart, and does the record give them enough to do it?

**A weak answer sounds like:** "Yes, the failed send is retried; we have retries with backoff." Automatic retry on an unknown outcome is exactly the double-send the product refuses.

Sources: `apps/saas/modules/inbox/lib/inbox.ts:175-199,296-339`, `packages/database/inbox/store.ts:65,173-186,376-380,463-480`, `apps/saas/modules/inbox/lib/approve.test.ts:241-249,296-311`, `docs/adr/0011-answer-is-the-record-of-a-send.md`, `HANDOFF.md:79-140`

### You are on the supastarter kit with Better Auth organizations, so the inbox scopes data by the session's active organization. How do you handle the organization switcher when an agent belongs to more than one office?

_Chapter: architecture_

<details><summary>Strong answer</summary>

It does not scope by the active organization, and that is the whole point of ADR 0010. session.activeOrganizationId is a client-writable preference: an outside audit showed a signed-in user can set it to any organization id through the kit's update-user endpoint, so trusting it would let any agent read any office's threads by editing a field on themselves. A preference cannot grant access. Instead resolveOffice reads the member table on every request and there is no switcher: exactly one membership yields the office, zero is 403 no_office, more than one is 403 ambiguous_office with a warning that ops has to fix. The kit's switcher is hidden with hideOrganization: true and users cannot create organizations. A Better Auth before hook refuses accept-invitation for an account already in an office, so the ambiguous state is unreachable through the normal flow. The AGENTS.md guidance about scoping with the active organization helpers is kit-generic and does not apply to inbox or home code. If the product ever needs a multi-office operator, the answer is still not the session field; it would be an explicit office parameter checked against the membership table on every request.

</details>

**Follow-up:** How did the audit find that, and what test pins it so a future kit upgrade cannot quietly reintroduce the session field?

**A weak answer sounds like:** Explains the kit's active organization helpers and a dropdown to switch, which is the pattern this codebase explicitly rejected after an audit.

Sources: `apps/saas/modules/inbox/lib/office.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/inbox/lib/require-session.test.ts`, `packages/auth/config.ts`, `packages/auth/auth.ts:150-165`, `docs/adr/0010-office-assignment.md`

### The queue tab is called Your turn. CONTEXT.md defines it as the guest spoke last. So the store checks whether the last message in the thread is inbound, correct?

_Chapter: data_

<details><summary>Strong answer</summary>

No, and CONTEXT.md's short definition is stale on that point; the Sending section has the precise one. unansweredInboundId is computed in mapConversation, which every read bottoms out in, by walking back to the latest inbound and asking two questions: does an Answer exist for that inboundId in sending, sent or unknown, or is there a later outbound with source oa-echo, meaning an agent replied from the vendor app and we learned it from the echo. If neither, it is Your turn. Message order is not consulted. The sequence that broke the old rule: M1 arrives, operator approves, Answer is sending, M2 arrives, the vendor acknowledges, completeAnswer stores the outbound as the last message. By order the office spoke last and the thread looks done; by Answers M2 has no Answer and stays in the queue. Both store.test.ts and approve.test.ts stage exactly that and assert unansweredInboundId equals m2. Two consequences: an Answer in sending or unknown closes the turn with no outbound message on disk, so a refresh mid-send does not reopen it; and failed is deliberately not in ANSWERING_STATUSES, so a definite refusal hands the turn back. There is one leftover: a store test title still says derived from the messages, pre-ADR-0011 wording on a correct body.

</details>

**Follow-up:** An oa-echo after a guest message counts as answered even if it was an agent saying hello to a different question. Is that the right call, and how would you know?

**A weak answer sounds like:** Confirms it checks whether the last message direction is in, which is the exact bug ADR 0011 fixed.

Sources: `packages/database/inbox/store.ts:136-186`, `packages/database/inbox/store.ts:64-65`, `apps/saas/modules/inbox/lib/store.test.ts:254-281`, `apps/saas/modules/inbox/lib/approve.test.ts`, `CONTEXT.md:40`, `CONTEXT.md:71`, `docs/adr/0011-answer-is-the-record-of-a-send.md`
