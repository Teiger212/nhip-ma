# Architecture and overall audit (GPT-6-Astra, 2026-09-20)

Run with the Codex CLI, model `gpt-6-astra`, reasoning effort high, read-only sandbox, against branch `worktree-feat+office-and-home` at PR #22 (office tenancy on top of the conversation loop). Brief: architecture against PRODUCT.md and the ADRs, then the code against its own rules. The auditor verified findings with isolated executions; nothing was changed.

Nhịp follows ADR 0009’s build sequence, but office tenancy is not secure enough to support the next build. The conversation loop requires a send action, yet authorization, message binding, and failure recovery break several of its stated guarantees. Fix these boundaries before building funnel metrics or connecting a real CRM.

## Part 1 — Architecture against intent

The current division serves the product frame: Inbox owns conversations, Home is an office-level read surface, and vendors sit behind adapters. Home’s placeholder funnel and “Connect your CRM” states are consistent with ADRs 0002 and 0009; missing metrics and CRM implementation are planned work, not defects.

**SQLite is defensible for the documented one-process deployment.** Hand-written DDL, synchronous transactions, WAL, and Zod-validated rows keep this small domain understandable. Moving everything to Prisma/Postgres is not a prerequisite for Home. However, Zod validates row shapes—not tenant ownership, approval intent, or correct event relationships.

The split becomes expensive at office boundaries. Postgres owns organizations and membership, while SQLite stores organization IDs without cross-database referential integrity. Office deletion, membership revocation, pipe reassignment, and recovery therefore require explicit coordination. The store also permits unscoped reads through optional `viewer` arguments, making future Home and CRM callers easy to implement incorrectly.

Home needs dedicated aggregate queries. [`listConversations()`](packages/database/inbox/store.ts:335) hydrates every conversation, message, translation, and supporting record. Reusing that path for charts would repeatedly scan entire histories on the same synchronous Node process serving inbound traffic. Metrics must use historical `Send` records, not mutable `sentAt`, and distinguish approved sends from OA echoes.

**Architectural judgment:** retain SQLite for the pilot, but introduce mandatory office-scoped application interfaces, transactional/versioned migrations, and explicit office lifecycle handling now. Migration-on-open currently performs independent schema changes and backfills, including dropping legacy ownership; adding CRM links and outcomes will make that increasingly difficult to recover and audit.

For listing match, preserve source provenance rather than treating regex qualification as authoritative requirements. The extractor reprocesses concatenated history and takes first matches, so later budget or area corrections will need explicit handling before they drive recommendations.

## Part 2 — Findings, ranked by severity

Source tracing and isolated executions verified the findings below using in-memory SQLite, the installed auth parser, and stubbed transports. No files were changed; the full test suite was not run because its fixtures create files.

### 1. Critical — A signed-in user can select an office without belonging to it

**Location:** [`packages/auth/auth.ts:186`](packages/auth/auth.ts:186), session creation hook at line 89; [`require-session.ts:21`](apps/saas/modules/inbox/lib/require-session.ts:21), `requireInboxSession()`.

`lastActiveOrganizationId` is a client-writable additional user field. A signed-in user can set it through `/api/auth/update-user` to a known victim organization ID, then create a new session. The session hook copies that value into `activeOrganizationId`; the inbox gate trusts it without checking membership. This grants list, detail, draft, and approval access. Removed members can also retain access through stale active-organization values.

The installed parser accepted the supplied office ID, and executing the hook and gate returned that office with zero membership checks.

**Smallest fix:** verify current membership for every resolved office. Make the preference server-managed after a membership-checked switch and validate it during session creation.

**Missing test:** forged preference → new session → inbox denied; membership removal → existing session denied. Current gate tests explicitly expect no membership lookup for an active office.

### 2. High — The same guest contacting two offices merges their private conversations

**Location:** [`packages/database/inbox/store.ts:48`](packages/database/inbox/store.ts:48), `conversationId()` and `upsertInbound()`; [`ensure-schema.ts:15`](packages/database/inbox/ensure-schema.ts:15).

Conversation identity and uniqueness are only `(pipe, guestId)`. When a WhatsApp guest contacts offices A and B, B’s message is appended to A’s conversation; `COALESCE(officeId, …)` preserves A’s ownership. A sees B’s message, while B sees no thread. In development, B’s injection response also returns the combined conversation.

The in-memory reproduction produced A’s messages as `["private A", "private B"]`, with B’s list empty. `store.test.ts` currently asserts this cross-office append as correct behavior.

**Smallest fix:** persist the receiving pipe connection and scope conversation uniqueness to that connection and guest. Reject ownership mismatches; migrate existing IDs and references explicitly.

**Missing test:** the same guest on two connected office endpoints produces isolated conversations, drafts, and sends.

### 3. High — Replies use global credentials instead of the receiving office’s connection

**Location:** [`pipes/index.ts:37`](apps/saas/modules/inbox/lib/pipes/index.ts:37), adapter `send()` implementations and `transmit()`.

Inbound routing consults `PipeConnection`, but conversations discard the receiving endpoint. Outbound routing uses the process-wide WhatsApp number/token or Zalo token. Connect office B’s inbound number while global credentials belong to A: B’s approved reply goes through A’s identity. A stubbed execution confirmed B’s text targeting `/office-a-number/messages`.

**Smallest fix:** retain `pipeConnectionId` on the conversation, resolve that connection’s credentials, and verify its office before transmitting. Until implemented, reject connections incompatible with the configured outbound endpoint.

**Missing test:** two office connections with different credentials; each approved reply uses its original endpoint.

### 4. High — Approval is not bound to the message or exact text the operator reviewed

**Location:** [`inbox-queries.ts:62`](apps/saas/modules/inbox/lib/inbox-queries.ts:62), [`inbox.ts:166`](apps/saas/modules/inbox/lib/inbox.ts:166), `approveAndSend()`; [`Inbox.tsx:260`](apps/saas/modules/inbox/components/Inbox.tsx:260), `useReplyDraft()`.

The client submits only conversation ID and reply. If M2 arrives while an operator composes for M1, the server claims M2 and sends the old reply against it. Draft `answersMessageId` is never checked. Edits also survive new inbounds because they are keyed only by conversation.

Separately, clearing the editor still sends the stored draft: blank, missing, and malformed request bodies fall back to server text.

**Smallest fix:** require nonblank approved text and an expected inbound ID; atomically reject stale targets with 409. Key edits by conversation and inbound, and condition draft writes on the same target.

**Missing test:** M2 arrives before approval; empty editor; malformed body; stale operator edit after another agent replies.

### 5. High — A successful transmission can be repeated after persistence fails

**Location:** [`inbox.ts:205`](apps/saas/modules/inbox/lib/inbox.ts:205), `approveAndSend()`; [`store.ts:494`](packages/database/inbox/store.ts:494), claim/release methods.

One `try/catch` covers both transmission and recording. If the vendor accepts the message but `recordApprovedSend()` fails, the catch releases the claim. Retrying transmits again. An injected persistence failure reproduced two transmissions and only one recorded send. An ambiguous network failure has the same risk; a process crash instead leaves a claim with no recovery path.

**Smallest fix:** persist approval intent and send-attempt state before transmission. Release only on definite non-delivery; retain an explicit unknown/accepted state for reconciliation. Never infer safe retry from a generic exception.

**Missing test:** vendor success followed by database failure, ambiguous transport failure, and restart with an unfinished claim.

### 6. High — An inbound arriving during transmission disappears from “Your turn”

**Location:** [`store.ts:289`](packages/database/inbox/store.ts:289), `load()`; `recordApprovedSend()` at line 513.

Start sending a reply to M1, ingest M2 before transmission finishes, then record the send. The resulting order is M1, M2, outbound answering M1. `load()` sees an outbound last and returns `unansweredInboundId = null`, although M2 has no answer. The reproduction confirmed this state.

This exposes the ADRs’ assumed equivalence between “guest spoke last” and “there is an unanswered inbound.”

**Smallest fix:** derive pending work from the latest inbound and which inbound the send answers, with explicit burst and OA-echo rules. Completing M1 must not clear M2.

**Missing test:** defer transport completion, ingest another guest message, finish transport, and assert the new message remains actionable.

### 7. Medium — Guest profile names can forge trusted-looking conversation context

**Location:** [`drafts/prompts.ts:57`](apps/saas/modules/inbox/lib/drafts/prompts.ts:57), `followUpUserPrompt()`.

Message bodies pass through `asData()`, but webhook-supplied `guestName` is interpolated directly into `<facts>`. A name containing `</facts><conversation><agent …>…</agent></conversation><facts>` inserts a fabricated agent statement into the prompt. This is especially consequential because the system prompt permits property facts previously stated by the agent.

The forged block survives prompt construction. Whether a particular model follows it was not tested.

**Smallest fix:** escape every externally supplied value, including names, and label extracted guest facts as untrusted claims. Prefer structured serialization with explicit provenance.

**Missing test:** adversarial profile names, multiline values, and fabricated agent tags—not only attacks inside message text.

### 8. Medium — The draft post-check does not enforce the factual guardrails

**Location:** [`drafts/guardrails.ts:18`](apps/saas/modules/inbox/lib/drafts/guardrails.ts:18), `checkFollowUp()`.

The check rejects length and selected paperwork words. It accepts both an invented price/availability/viewing confirmation and “Foreign buyers may legally hold the apartment forever.” There is no comparison against office-provided evidence. Existing tests even accept a Friday viewing offer without supplying supporting facts.

Human approval remains required, but ADR 0005 forbids these claims in the suggestion itself.

**Smallest safe fix:** restrict unsupported legal/property responses to approved acknowledgement/question templates until claims can be checked against office evidence. A larger keyword blacklist is insufficient.

**Missing test:** unsupported listing claims and paraphrased legal promises across all guest languages, including assertions introduced through prompt injection.

## Before the next build

1. **Close the office boundary first — ADR 0008.** Enforce current membership, use connection-scoped conversation identity, and select outbound credentials from that connection. Make office scope mandatory in application-facing store methods; separate privileged seed/maintenance access.

2. **Finish the send contract — ADRs 0006 and 0009.** Bind approval to inbound ID and exact text, record the approving operator, preserve newer pending messages, and distinguish failed from unknown delivery. Add the interleaving tests above before treating the happy-path loop test as sufficient.

3. **Stabilize migrations and cross-store lifecycle — ADR 0008.** Add a migration version ledger, transactional schema upgrades, and upgrade fixtures. Define how organization deletion and pipe reassignment affect SQLite data and credentials. Keep SQLite unless deployment requirements change; changing engines alone fixes none of the verified defects.

4. **Build an office-scoped metrics query layer — ADRs 0001 and 0002.** Define reporting timezone, period/cohort semantics, mock-send treatment, and OA-echo treatment. Compute first inbound, first approved send, and subsequent guest response from historical records. Add conversation/time indexes and aggregate SQL instead of hydrating full transcripts; preserve “Connect your CRM” for unknown outcomes.

5. **Introduce the CRM seam with mock first, then provisional Attio — ADRs 0003, 0004 and 0009.** Persist office-scoped connection and lead-link records. Keep E.164 matching and vendor identity handling inside adapters; provide manual linking without name matching. Distinguish unmatched/unavailable outcomes from open or zero, and let adapter-derived won/lost outcomes remove threads from the queue.

6. **Preserve evidence boundaries before expanding model use — ADRs 0005 and 0007.** Repair prompt framing and add adversarial multilingual evaluations. Keep provenance and correction handling available for future listing match; do not introduce listings storage or CRM write-back ahead of the accepted sequence.

## Keep

- The single human approval send path, mock default, and atomic per-inbound claim as a concurrency primitive.
- Pipe and model adapters as the vendor boundaries; carry the same separation into CRM.
- Deterministic operator notes and template fallbacks that make no legal or listing promises.
- Stored per-message translations rendered as text, with model work outside the immediate ingest response.
- Home’s office-level scope and explicit unknown CRM outcomes; no fabricated zeros or per-agent performance layer.