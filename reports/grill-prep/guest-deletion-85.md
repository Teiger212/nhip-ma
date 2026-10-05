# Grill pack: #85 guest-data deletion (PDPL)

2026-10-04. **Not legal advice**: deadlines and roles are for the Vietnamese lawyer (#99).

## 1. What exists

**Issues.** #85 is OPEN, `needs-triage`, no comments: deletion "includes data held by outside processors, such as the office's CRM". Epic #109. #99 lists it as pre-client code, "legal basis UNKNOWN". #93 (the 30-day office purge): "the purge must also reach the office's CRM, per PDPL".

**Docs that already decide something.**

- PRODUCT.md trust bar: "guest-data deletion in place" before real guests reach prod. PRODUCT.md:150: "an admin audit log" is "Later, not shown".
- ADR 0015:23: the platform admin "never sees guests' threads"; reassign and CRM linking are manager-only.
- CONTEXT.md:164: "No guest-side accounts", so requests come through the agency.

**Law (EY, VILAF summaries; not checked against the decree).** Decree 356: reply in 2 working days, delete in 20 days, 30 when a processor or third party deletes. (inf.) The office is the controller, Nhịp its processor.

**Where guest data lives** (`packages/database/prisma/schema.prisma`):

| Table (line)                                               | Guest data                                                                                          | What deleting the thread does                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Conversation (303)                                         | `id` = `office:pipe:guest`, `guestId` (Zalo user id; WhatsApp phone, inf.), `guestName`, `language` | the root                                                                                                   |
| Message (333), Translation (362), TranslationFailure (378) | message text and its translations                                                                   | cascade                                                                                                    |
| Qualification (391), Paperwork (428), Draft (409)          | extracted fields, the draft text                                                                    | cascade                                                                                                    |
| Answer (444)                                               | `text`, `to` (guest id)                                                                             | cascade                                                                                                    |
| CrmLink (574)                                              | `leadId`, `leadName`, `method` (created / phone / zaloId)                                           | cascade                                                                                                    |
| **MockCrmLead (601)**                                      | name, phone, zaloUserId, fields, `threadUrl`                                                        | **does not cascade**: keyed on `officeId` only                                                             |
| WebhookDelivery (510)                                      | vendorMessageIds and endpoints; no text, no guest id                                                | kept for 30 days (`webhook.ts:9`); pruned on 1% of deliveries (`webhook.ts:70`), so 30 days is approximate |

**Code.** `store.deleteConversations(officeId, ids)` (`packages/database/inbox/store.ts:564`) already deletes a thread tree; only the seed calls it (`seed.ts:60`). `CrmAdapter` (`crm/types.ts`) has **no delete**.

**CRMs.** HubSpot app scopes include `crm.objects.contacts.write`, `deals.write` (`app-hsmeta.json:12-15`); whether they allow archive or GDPR-delete is UNKNOWN. Attio deletion: UNKNOWN (not in its research).

**Kit.** `ConfirmationAlertProvider` (`destructive: true`, lines 16-21); toast.promise (`OrganizationList.tsx:105`). Thread header: `ThreadDetail.tsx:75-91`.

**Kept elsewhere, out of reach:** the chat in the agency's Zalo OA or WhatsApp; text sent to the model provider (OpenRouter, `drafts/adapter.ts:24-25`); Neon point-in-time history (window UNKNOWN); Vercel logs (inf.). PostHog gets scrubbed data only (`scrub.ts`).

**Contradiction.** ADR 0003:61: "production stays on the mock until a beta agency names its CRM". CONTEXT.md:144: the mock is "for development and demos only". If prod uses the mock, MockCrmLead holds real guests.

**The thread id is personal data**: logging it logs the guest.

## 2. What's undecided

1. **Who deletes**: manager, agent or platform admin (ADR 0015 decides part).
2. **Hard delete or anonymise** (keeps funnel numbers).
3. **CRM rule**: delete, unlink or nothing; depends on `CrmLink.method`, adapter scopes, 1.
4. **Mock CRM leads**: depends on the contradiction above.
5. **Deletion record**: contents, home, readers; depends on 2.
6. **Guest writes again**: fresh thread, or a suppression list (itself PII).
7. **Races**: Answer `sending`/`unknown`, CRM retry (#64), vendor redelivery.
8. **Retention defaults**: threads, backups; depends on Neon plan and lawyer.
9. **#93 reuse** of the same path.

## 3. UI/UX shape

**Who sees what.** Manager: "Delete guest data" in the header's overflow menu. Agent: nothing; asks a manager, as for reassign. Platform admin: no thread view (ADR 0015); later, a lookup by phone/Zalo id. Guest: nothing; the agency answers on Zalo/WhatsApp.

**DESIGN.md.** The Red Means Broken Rule: Signal Red only on the confirm ("only for the irreversible"). The Pill Acts Rule: the trigger acts; the CRM result is a squared Badge. The Flat Desk Rule: the dialog is a floating layer, so its shadow is allowed. 44px targets. Copy: plain facts in EN and VI, never "erased everywhere".

```
Thread header (manager)
[<] (MK) Minji Kim  [Zalo] [HubSpot: open] [Owner: Lan v]  [...]
                                              └ Delete guest data
```

```
┌ Delete Minji Kim's data? ───────────────────────────────┐
│ Nhịp deletes: 14 messages, translations, the draft,     │
│ 3 sent replies, the extracted details.                  │
│ HubSpot: Nhịp created this lead, so it is deleted too.  │
│   (or) This lead was already in HubSpot; Nhịp only      │
│   unlinks it. Delete it there if the guest asked.       │
│ Kept elsewhere: the chat in your Zalo OA.               │
│ This can't be undone.                                   │
│                      [ Cancel ]  [ Delete guest data ]  │ ← red pill
└─────────────────────────────────────────────────────────┘
```

**States.** Deleting: toast "Deleting…". Success: the thread leaves the list (empty state if last), the toast names the CRM result. CRM failed: "Deleted in Nhịp; HubSpot didn't answer, retrying", receipt pending. Refused: disabled while an Answer is `sending` ("A reply is still sending"). Home's funnel shrinks; correct, so nothing is hatched.

## 4. Round 1

1. **Who performs a deletion?**
   - Options: (a) managers only; (b) managers and agents; (c) the platform admin.
   - **Recommend (a):** matches reassign and CRM-link; ADR 0015 keeps the admin out of threads.
2. **Hard delete, or anonymise?**
   - Options: (a) a hard delete through the existing cascade; (b) blank the text but keep the rows, so the funnel keeps its numbers.
   - **Recommend (a):** the call exists; rows keyed by `office:pipe:guest` stay personal data anyway.
3. **What happens in the office's CRM?**
   - Options: (a) Nhịp deletes there; (b) Nhịp deletes the lead only if it created it, and only unlinks one it found; (c) Nhịp never touches the CRM.
   - **Recommend (b):** a lead found by phone or Zalo id is the office's own record; the dialog says which case applies.
4. **The mock CRM in prod.**
   - Options: (a) prod runs on the mock and deletion includes its lead; (b) prod has no CRM until a real one is connected.
   - **Recommend (a):** delete the lead matching `CrmLink.leadId`; fix CONTEXT.md. About an hour.
5. **The record of a deletion.**
   - Options: (a) nothing; (b) a receipt row; (c) the full audit log.
   - **Recommend (b):** a small `GuestDeletion` table holding the office, the actor, the time, row counts, and the CRM result (deleted / unlinked / pending / failed), with **no guest identifier**. A hash of the phone is arguably still personal data.
6. **How much friction does the confirmation have?**
   - Options: (a) one dialog; (b) typing the guest's name to confirm.
   - **Recommend (a):** rare, deliberate, and the dialog lists what goes.
7. **A guest who writes again after a deletion.**
   - Options: (a) a fresh thread and a fresh lead; (b) a suppression list.
   - **Recommend (a):** a new contact; a suppression list would keep the deleted identifier.
8. **Retention defaults at go-live.**
   - Options: (a) none: threads stay until deleted, and backups follow Neon's window; (b) auto-purge after N months.
   - **Recommend (a),** documented; the window goes to the lawyer. A purge job needs a scheduler (none yet, #93).

## 5. Later rounds

- Each adapter's `deleteLead`: what HubSpot's archive versus GDPR-delete actually does, and whether the scopes cover it (round 1 Q3).
- Whether Attio can delete, if the first client uses Attio (#101).
- A lookup by phone or Zalo id for the platform admin, for a guest the manager can't find (round 1 Q1).
- Where receipts show (Q5): manager Settings or admin area.
- Races (Q2):
  - a CRM write-back retry (#64) recreating a lead after the deletion;
  - an `unknown` Answer that's still unreconciled;
  - a vendor redelivering an old message, which recreates the thread.
- #93's office purge reusing this path, CRM leads included.
- Export before deleting (access right); the model provider's retention for the A05 dossier.

## 6. Go-live cut (2026-10-18)

**Must ship, about 2 days:**

- a store method that deletes the thread tree, the mock lead and the receipt in one transaction, refusing while an Answer is `sending` (0.5 d);
- the API route, manager-only and scoped to the office (0.25 d);
- the header item and the dialog in EN and VI, built on the kit's confirmation (0.5 d);
- an E2E scenario, "a manager deletes a guest; the thread, its lead and its replies are gone; an agent can't" (0.5 d);
- docs: an ADR, CONTEXT.md, and the kept-elsewhere list for the lawyer (0.25 d).

**Must ship if a real CRM is live on prod:** that adapter's `deleteLead` plus the created-versus-found rule, about 1 day per adapter.

**After:** admin lookup, receipts list, retention job, export, races, #93 reuse.

## Decided (Eyal, 2026-10-04). Not legal advice

**Round 1:**

- **Q1:** managers only. An agent asks a manager. The platform admin stays out of threads (ADR 0015).
- **Q2:** hard-delete the thread and everything under it (`store.deleteConversations`). Keep **one anonymous stat row per deleted guest**: office, first contact time, first reply time, the stage reached (engaged, in conversation), outcome, pipe and language. No identifier and no text. Home's funnel and response times add these rows in, so numbers over time stay exact. Free text is never kept, since it can't be anonymised reliably.
- **Q3:** the dialog has a checkbox, "Also delete <guest> in <CRM>".
  - Ticked by default when Nhịp created the lead (`CrmLink.method = created`); unticked when Nhịp found it there.
  - Ticked: the adapter deletes the lead (HubSpot: archive the contact and deal; Attio: delete the record). Unticked: Nhịp only unlinks.
  - No CRM: no checkbox. About 0.5 day per CRM for its delete call.
- **Q4:** a receipt row (`GuestDeletion`) with no guest identifier: office, actor, time, row counts, and the CRM result (deleted, unlinked, pending or failed).
- **Q5:** one confirmation dialog from the thread header's ⋯ menu, "Delete guest data". It lists what goes and what's kept elsewhere (the chat in the agency's Zalo or WhatsApp). The red button is the only red. No typing the name to confirm.
- **Q6:** a guest who writes again gets a fresh thread and lead. No suppression list.
- **Q7:** no automatic retention at go-live. Threads stay until deleted, and backups follow Neon's window. The lawyer is asked about periods.
- **Q8:** deletion is disabled while an Answer is sending ("A reply is still sending").

**Round 2:**

- **R1:** the manager finds the guest in the Inbox. No lookup for the platform admin at go-live.
- **R2:** receipts aren't shown in the UI at go-live; they're read on request. A managers' "Deletions" list comes later.
- **R3:** no export or access copy at go-live; it's recorded in #109 as later.

**Edge cases noted, not built:**

- A vendor redelivering an old message minutes after a deletion recreates the thread with it.
- A pending CRM retry dies with the cascaded `CrmLink`.
- `MockCrmLead` never holds real guests (the mock is never in production), so deletion needn't reach it in production. Dev and tests may still clean it.
