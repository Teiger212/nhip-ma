# 0020. A manager deletes a guest's data; the funnel keeps an anonymous tally

Date: 2026-10-04. Status: accepted. Extends ADRs 0003, 0011, 0012 and 0015. Not legal advice:
the deadlines and roles below are for the Vietnamese lawyer (#99).

## Context

Vietnam's Personal Data Protection Law makes deleting a guest's data on request a go-live duty
(PRODUCT.md trust bar, #85). Summaries of Decree 356 (EY, VILAF; not checked against the decree)
give 2 working days to reply and 20 days to delete, or 30 when a processor or third party
deletes. The office is the controller and Nhịp its processor (inferred). Guests have no
accounts (CONTEXT, "Deliberately not"), so a request reaches the agency, and a manager acts on it.

A guest's data in Nhịp is one thread and everything under it. The id `office:pipe:guest` holds
the guest's Zalo user id or phone, so the id itself is personal data. `Conversation` cascades to
Message, Translation, TranslationFailure, Qualification, Draft, Paperwork, Answer and CrmLink
(ADR 0012), and `store.deleteConversations` already deletes the whole tree, though only the seed
calls it. The guest may also be a lead in the office's CRM. `CrmAdapter` has no delete.

Deleting a thread also deletes the rows Home counts. Leads in, engaged, in conversation,
response time and leads by day would shrink after the fact, and a manager comparing weeks
would see numbers change under them.

Grilled with Eyal on 2026-10-04 (`reports/grill-prep/guest-deletion-85.md`, round 1 Q1 to Q8,
round 2 R1 to R3, and the follow-ups on the CRM).

## Decision

- **Managers delete; nobody else does** (Q1). The thread header's ⋯ menu has "Delete guest
  data" for a manager only. An agent asks a manager, as for reassign (ADR 0015). The platform
  admin never sees threads (ADR 0015), and the inbox gate refuses them before any office is
  read. The manager finds the guest in the Inbox; the platform admin gets no lookup at go-live
  (R1).
- **Hard delete, with an anonymous lead tally** (Q2). The thread and everything under it are
  deleted through the existing cascade. In the same transaction Nhịp writes one **lead tally**
  per deleted guest who wrote in. A tally holds the office, the first contact time, the first
  reply time, whether the lead reached in conversation, the CRM outcome, the pipe and the
  language. It holds no identifier, no thread id and no text. Free text is never kept, since it
  cannot be anonymised reliably. Home adds tallies into its funnel and response time, so the
  numbers for a past period stay exact.
- **The CRM is a checkbox, defaulted by who made the lead** (Q3). When the thread has a CRM lead,
  the dialog shows "Also delete <guest> in <CRM>":
  - ticked by default when `CrmLink.method = created`;
  - unticked when Nhịp found the lead (`phone`, `zaloId`).

  The request always carries the choice explicitly; the default lives in the UI only.
  - **Ticked:** the adapter deletes what Nhịp made.
    - **HubSpot** archives the deal Nhịp created. It archives the contact only if Nhịp created
      that contact itself, rather than reusing an existing one, and the contact has no other
      deal.
    - **Attio** deletes the record (with #101).
  - **Unticked:** Nhịp only unlinks, which the cascade does. A deal Nhịp created on a contact
    it found stays in the CRM.
  - **No checkbox** for an office with no CRM, or for a thread with no lead: one whose lead
    write never succeeded ("Not in CRM yet"), or, once manual linking exists (#70), a lead a
    manager linked by hand. There is nothing Nhịp made to delete.

- **A failed CRM delete is not retried at go-live.** Nhịp has already deleted the thread. The
  toast tells the manager to delete the lead in the CRM by hand, and the receipt says `failed`.
- **A receipt, with no guest identifier** (Q4). One `GuestDeletion` row per deletion, holding:
  - the office;
  - the actor, as a set-null link plus a name snapshot, like `Answer.operatorName` (ADR 0013);
  - the time;
  - row counts (messages, sent replies, translations);
  - the CRM result: `deleted`, `unlinked`, `pending` or `failed`, or null with no lead.

  It holds no guest name, no guest id, no thread id and no CRM id. Receipts are not shown in the
  UI at go-live. They are read on request, and a managers' "Deletions" list comes later (R2).

- **One confirmation, no typing** (Q5). The dialog lists what goes and what is kept elsewhere:
  the chat in the agency's own Zalo OA or WhatsApp. Its confirm button is the only red on it
  (DESIGN.md, The Red Means Broken Rule). The menu item that opens it is not red.
- **A guest who writes again is a new guest** (Q6). They get a fresh thread and, if their CRM
  lead was deleted, a fresh lead. There is no suppression list, since one would keep the very
  identifier the guest asked to remove.
- **No automatic retention at go-live** (Q7). Threads stay until deleted; backups follow Neon's
  window. The lawyer is asked about periods (`docs/setup-checklist.md`).
- **Not while a reply is sending** (Q8). Deleting is refused while any of the thread's Answers is
  `sending` (ADR 0011). The menu item is disabled with "A reply is still sending", and the API
  answers `409 reply_sending`.
- **No export at go-live** (R3). The access copy is recorded under #109 as later.

## How it is built

- **One store method, one transaction.** `deleteGuest(officeId, conversationId, { countMock })`
  runs these steps in one transaction:
  1. `SELECT … FOR UPDATE` the conversation, scoped to the office; none means not found.
  2. `SELECT … FOR UPDATE` the thread's Answers, and refuse with `reply_sending` if one is
     `sending`.
  3. Read the CRM link (`leadId`, `method`, `createdContactId`, `outcome`) and the row counts.
  4. Compute the tally and insert it, unless the thread has no guest message.
  5. Insert the receipt.
  6. Delete the conversation; the cascade takes the rest.
- **Approve takes the same locks in the same order.** `beginAnswer` starts with
  `SELECT … FROM inbox_conversation … FOR KEY SHARE`, on both the first-send path and the retry
  of a `failed` Answer, before it reads or writes an Answer. Both transactions then lock the
  conversation first and Answers second, so they cannot deadlock (Postgres `40P01`).
  `FOR KEY SHARE` conflicts with the delete's `FOR UPDATE` but not with another approval's lock
  or the owner claim's update, so approvals don't queue behind each other.
  - **Approve first:** the delete waits, then sees `sending` and refuses.
  - **Delete first:** approve waits, then finds no conversation and returns `not_found`, which
    the route answers with 404.
  - A foreign-key failure (Prisma `P2003`) is also `not_found`, never a generic 500.
- **The tally and the funnel share one definition of a lead's numbers.** The funnel's raw query
  (`store.funnel`) computes each lead's `firstInboundAt`, `firstSentAt` (the first `sent`
  Answer, filtered by `countMock`, or the first `oa_echo`) and `wroteBack`. That per-lead SQL
  becomes one fragment, parameterised by office, an optional `since` and an optional thread id.
  - **The funnel** uses it for the cohort, bounded by `since`.
  - **`deleteGuest`** uses it for its one thread, with no `since` bound and the deployment's
    `countMock`, so a tally is exactly the row the funnel would have read. `SEND_MODE` is fixed
    per deployment, so the flag a tally was computed under is the flag Home reads with.
- **Home adds tallies inside the same query** (ADR 0012, "the funnel stays one query"). The
  final `SELECT` gains a `UNION ALL`:

  ```sql
  SELECT "firstInboundAt", "firstReplyAt" AS "firstSentAt", "inConversation" AS "wroteBack"
  FROM "inbox_lead_tally"
  WHERE "officeId" = ${viewer.officeId} AND "firstInboundAt" >= ${since}
  ```

  Leads in, engaged, in conversation, the median, p90, the bands and leads by day are then
  computed in JavaScript exactly as today. Closings and Lost (#68, not built) must count tallies
  whose `outcome` is won or lost in the same cohort.

- **The CRM call runs after the commit**, in a guest-deletion module that the route calls (like
  the CRM sync module).
  - **Ticked:** the receipt is written `pending`. After the commit the module calls
    `adapter.deleteLead({ leadId, createdContactId })` and sets the receipt to `deleted` or
    `failed`. A CRM that is down never blocks the deletion in Nhịp.
  - **Unticked:** the receipt says `unlinked`, and the CRM is not called.

  The CRM ids are held in memory for that one call and are never written to the receipt.

- **The adapter seam gains one operation** (ADR 0003):
  `deleteLead(lead: { leadId: string; createdContactId: string | null }): Promise<void>`. A lead
  the CRM no longer knows counts as deleted. An office with no CRM connection never calls the
  seam.
  - **The mock** deletes its `MockCrmLead` row by `leadId`, for dev, E2E and the demo; the mock
    never holds real guests.
  - **HubSpot** archives the deal: `DELETE /crm/objects/2026-09/0-3/{dealId}`, scope
    `crm.objects.deals.write`. When `createdContactId` is set and that contact has no other
    deal, it archives the contact too (`crm.objects.contacts.write`). Production needs this only
    if intake (#128) gives the first client HubSpot.
  - **Attio** deletes the record, with the Attio adapter (#101), if intake picks Attio.
- **Which contact Nhịp created is recorded at creation.** `CrmLink` gains a nullable
  `createdContactId`. HubSpot's `createLead` returns the contact's id only when it created that
  contact. Today it does `contactIds[0] ?? createContact()`, which drops the distinction. The
  sync module stores the id. A link whose `createdContactId` is null keeps its contact, which
  covers a reused contact and every link written before the column existed. This must ship
  before the first production HubSpot lead is written, or those contacts can never be archived.
- **The API** is `POST /api/conversations/:id/deletion` with body `{ deleteInCrm: boolean }`,
  required. It answers in this order:
  - the inbox gate (401 signed out, 403 for the platform admin);
  - 403 `forbidden` for an agent, before the body is read;
  - 404 for a thread the manager's office does not have;
  - 400 when the body is missing;
  - 409 `reply_sending`;
  - otherwise 200 with `{ crm: "deleted" | "unlinked" | "failed" | null }`.

  Nhịp's code never logs the thread id, which carries the guest's id, and logs errors as a
  category only. The URL path does carry the id, so Vercel's request logs record it (see
  Consequences).

- **Data.** Each migration comes from `migrate:new` and is additive:
  - two new tables, `LeadTally` (`inbox_lead_tally`) and `GuestDeletion`
    (`inbox_guest_deletion`), both cascading from `Organization`. Expand/contract row "New
    table": 1 deploy.
  - `CrmLink.createdContactId`, nullable, with the HubSpot work. Row "New nullable column":
    1 deploy.

  The code before each migration never reads what it adds. `resetInboxTables`' `TRUNCATE` gains
  both tables.

## Considered options

- **Anonymise in place**: blank the text and keep the rows. Rejected: rows keyed by
  `office:pipe:guest` stay personal data whatever is blanked.
- **Hard delete with no tally**: the funnel shrinks after the fact. Rejected (Q2).
- **Always delete the CRM lead, or never touch it.** Always deleting would remove a lead the office
  owned before Nhịp found it. Never touching it leaves the lead Nhịp itself created, which the
  office may not know exists. A checkbox defaulted by `method` covers both (Q3).
- **Archiving the contact whenever the deal goes**: it would archive an office's own contact
  that Nhịp only reused. Rejected for the created-and-no-other-deal rule.
- **A suppression list** so a deleted guest is not re-filed: it would keep the identifier (Q6).
- **Typing the guest's name to confirm**: deletion is rare and deliberate, and the dialog lists
  what goes (Q5).

## Consequences

- A guest's data in Nhịp's own database is gone at once. It persists elsewhere:
  - Neon's point-in-time history, for its window;
  - Vercel's request logs, which record URL paths, and so the thread id in
    `/api/conversations/<id>/…`;
  - the model provider's retention for text sent to it (OpenRouter);
  - the agency's own chat app;
  - an alert already delivered to an operator's device (ADR 0019), which shows the guest's name
    until it is dismissed.

  These go to the lawyer, not into code. ADR 0019's `InboxAlert` rows must cascade with the
  thread when they are built.

- `WebhookDelivery` keeps vendor message ids for about 30 days (pruned on 1% of deliveries). They
  carry no text and no guest id.
- Home's numbers for a past period do not move when a guest is deleted. Waiting now, the queue
  and the nav count drop the thread, which is correct.
- A tally's exact times, pipe and language are anonymous to Nhịp. Whether someone holding the
  agency's own chat could tie them back is a question for the lawyer.

## Edge cases noted, not built

- A vendor redelivering an old message minutes after a deletion recreates the thread with it.
- A pending CRM write retry (#64) dies with the cascaded `CrmLink`.
- A first-message lead write in flight when the thread is deleted (the `CrmLink` claim exists,
  but `leadId` is still null) can still create the lead in the CRM afterwards. Nothing links or
  deletes that lead.
- A failed CRM delete is not retried. Retrying would mean keeping the CRM ids after the thread is
  gone, so the manager deletes the lead by hand, as the toast says.
- A thread with an `unknown` Answer can be deleted; its reconciliation is lost with it.

## Open

- **Archive versus permanent delete in HubSpot.** Archiving a contact is restorable for 90 days
  (HubSpot's docs); the deal's restore window is not verified. HubSpot's GDPR delete
  (`POST /crm/v3/objects/contacts/gdpr-delete`, `crm.objects.contacts.write`, free tier) is
  permanent and covers contacts only; the deal stays. Which one the law needs is for the
  lawyer.
- **Attio's delete.** The endpoint is `DELETE /v2/objects/{object}/records/{record_id}`, with
  scopes `object_configuration:read` and `record_permission:read-write` (both in #101's list).
  Whether it is permanent is not documented. It is decided with #101.
- **Closings deduplication.** #68 counts one closing per lead. A tally has no lead id, so a
  deleted thread whose lead another thread shares counts twice.
- **#93's office purge** may reuse `deleteGuest` per thread, CRM leads included.
