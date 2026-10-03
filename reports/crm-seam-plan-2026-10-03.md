# CRM seam: plan after review and grilling (2026-10-03)

The goal is a demo that wins: on Zalo, a guest writes, the contact and deal appear in
HubSpot, an agent replies in Nhịp, a manager marks the deal won in HubSpot, and Nhịp's
Home counts the closing.

**The code is not the bottleneck.** The bottleneck is the real-world setup only Eyal can
do (`docs/setup-checklist.md`):

- a Zalo OA,
- a second Zalo account to play the guest,
- `SEND_MODE=live`,
- a HubSpot free account with a private app.

Build the code in parallel so it is ready before the setup is.

## Starting point

- `origin/feat/crm-seam` (12 commits, ADR 0003, mock CRM only) was reviewed. Its design is sound: an adapter seam, a cached link per thread, outcomes read from the CRM, and conditional writes so an agent's link always wins.
- **Do not rebase it.** Re-implement it in slices on `main`, copying from the reference branch.
- **Reference branch:** `scratch/crm-seam-on-refit` (`dbd43b8`) merged the old branch onto the refit. It was deleted on 2026-10-03: its five bug fixes live on in `feat/crm-data-queue`, and the old code is still on `origin/feat/crm-seam`. The scratch DBs `crmscratch` and `crmscratch_test` remain until the cleanup (Q10).
- **Bugs a rebase would ship silently.** All five are fixed on the reference branch:
  - the nav count must use `inQueue`;
  - `summarize()` must carry `crm`;
  - `listConversationSummaries` must LEFT JOIN `inbox_crm_link`;
  - `countYourTurn` must exclude resolved threads (`AND NOT RESOLVED`, wrapped in `COALESCE`);
  - `flagClass` is gone; use `badge()`.

## Decisions (Eyal, 2026-10-03)

Record these in ADR 0003 and the ADR 0015 amendment in the first slice.

| #   | Decision                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Managers only** search the CRM and link or unlink by hand; agents see the CRM status read-only. Amends ADR 0003's "the agent picks the lead". Flagged for a UX/PM rethink later. Q14 removes most manual linking anyway.                                                                         |
| Q2  | **A real CRM is in scope, for a demo.** The demo shows the whole round trip: write (first message creates contact + deal), then read (won/lost flows back). Write-back moves forward from "second" in ADR 0003 (amend). Staging only; prod stays on the mock until a beta agency names its CRM.    |
| Q2c | Order: slice A+B, then the HubSpot slice, then the rest.                                                                                                                                                                                                                                           |
| Q3  | A resolved thread returns when the guest writes after **`outcomeObservedAt`**, the time Nhịp first saw that outcome. Not the CRM's own close date, not `checkedAt`.                                                                                                                                |
| Q4  | **Webhooks** update the cached outcome right away. A slow **reconcile** (about hourly per office) behind a DB lease (`refreshedAt`, single-flight across instances) catches anything a webhook missed. No refresh from the 10 s inbox poll.                                                        |
| Q5  | Home never waits on the CRM. It shows cached Closings/Lost with an "as of" time.                                                                                                                                                                                                                   |
| Q6  | The admin sets an office's CRM **inside the Connections card**, next to Zalo and WhatsApp.                                                                                                                                                                                                         |
| Q7  | Each slice ships its own tests: Vitest for its rules, Playwright specs for its user flows.                                                                                                                                                                                                         |
| Q8  | One PR per slice, each branched from `main` after the previous one merges. **No stacking.**                                                                                                                                                                                                        |
| Q9  | Demo seed: Alexei is a lost lead, Thảo has an open lead, the Zalo threads have no match.                                                                                                                                                                                                           |
| Q10 | Clean up after the last slice merges: the old branch, the scratch worktree and branch, and the scratch DBs.                                                                                                                                                                                        |
| Q11 | **A lead is created in the CRM on the guest's first message**, for every new guest.                                                                                                                                                                                                                |
| Q12 | The CRM record gets name, phone, pipe, language, the extracted fields (area, rent/buy, budget, timeframe, household) and a link to the thread. **No message transcripts.**                                                                                                                         |
| Q13 | If the phone is already in the CRM, reuse the contact. Create a new deal only if that contact has no open deal; otherwise link the thread to the open deal. Never create duplicates.                                                                                                               |
| Q14 | A contact Nhịp creates also stores the **Zalo user id** in a custom property, so later lookups match automatically.                                                                                                                                                                                |
| Q15 | Deals are created **unassigned**. Mapping Nhịp users to CRM users comes later.                                                                                                                                                                                                                     |
| Q16 | A failed CRM write retries with backoff and a cap, like `inbox_translation_failure`. Managers see "Not in CRM yet". The guest and the queue are never blocked.                                                                                                                                     |
| Q17 | The demo's inbound is a **real pipe**. No simulate tool on staging. Build and rehearse locally against the HubSpot sandbox in the meantime.                                                                                                                                                        |
| Q18 | CRM credentials are **encrypted per office**, like `PipeCredential` (ADR 0017). For HubSpot, a private-app token entered by the platform admin in Connections. A public OAuth app comes only when several offices use HubSpot.                                                                     |
| Q19 | Use **`libphonenumber-js`** with VN as the default region. Test `+84 0…`, the `00` prefix, Excel-stripped zeros and short numbers.                                                                                                                                                                 |
| Q20 | **The demo CRM is HubSpot's free CRM.** It never expires, buyers recognise it, the deal board is where you see the closing, it has signed webhooks, and one call creates the contact with its associated deal. Bitrix24 is the likely second adapter for Vietnam. Attio is dropped as the default. |
| Q21 | **Go.**                                                                                                                                                                                                                                                                                            |
| Q22 | Ask the first beta agencies which CRM they use before building a second adapter (on the checklist, PR #54).                                                                                                                                                                                        |
| Q23 | **The demo pipe is Zalo.**                                                                                                                                                                                                                                                                         |

## Slices, in order (one PR each, from `main`)

**Superseded (2026-10-03).** The slice 1 audit found these slices are layers, not vertical slices. The CRM seam is re-sliced into tracer-bullet tickets through `/to-spec` and `/to-tickets` (`docs/agents/`), and delivery order lives in that spec, not here or in ADR 0003. The slices are kept below for the record.

1. **A+B: data and queue.**
   - Schema: CRM connection, link and mock lead, with `outcomeObservedAt` and `refreshedAt`; an additive migration via `migrate:new` at land time.
   - Store methods, the summary SQL with `crm`, and `countYourTurn` excluding resolved threads.
   - Queue rules (`isResolved`, `inQueue`, `threadStatus`), the nav count, `summarize()` carrying `crm`.
   - **Neutral Won/Lost badges**, and the DESIGN.md and CONTEXT amendments.
   - The ADR 0003 and 0015 amendments carrying the decisions above.
   - `lib/crm/{types,phone,mock}.ts` with `libphonenumber-js`, and the mock adapter refusing ambiguous phone matches.
   - Tests: Vitest for the queue and store; a Playwright spec for "lost leaves the queue and comes back".
2. **HubSpot: write-back, webhook, credentials.**
   - The `CrmAdapter` gains `createLeadForGuest`. `CrmKind` gets `hubspot`.
   - The HubSpot adapter: create a contact (phone, Zalo id property) plus its associated deal; find a contact by phone; read outcomes from `dealstage`.
   - Create on first inbound, in the background with `after()`. A per-thread idempotency lock stops two quick first messages from creating two contacts. Store the CRM ids Nhịp created; search only for leads Nhịp didn't create.
   - A webhook route for deal stage changes, checking HubSpot's v3 signature and timestamp. It updates the cached outcome and sets `outcomeObservedAt`.
   - The hourly reconcile behind the lease.
   - The encrypted per-office token and the Connections UI for it.
   - Failure backoff (Q16).
   - Logging records only a category, never the raw CRM error.
   - Tests: Vitest with HubSpot's HTTP mocked at the adapter boundary; the webhook signature tests.
3. **D+F: Home, admin, seed, docs.**
   - Home's funnel strip fills Closings and Lost from the cache, with the "as of" time and no wait.
   - The CRM setting inside Connections (none, mock or HubSpot).
   - The seed (Q9).
   - ARCHITECTURE and AGENTS updates; a Playwright spec that the admin-only setting refuses a non-admin.
4. **E: manual link UI and the remaining specs.**
   - `CrmLink` rebuilt to pass shadcn lint and the Pill Acts Rule; managers only; debounced search with a 3-character minimum.
   - Playwright specs:
     - cross-office leads and threads answer 404;
     - an agent can't link a colleague's thread;
     - managers only.

**Also before more offices use a real CRM:**

- A foreign key from `CrmLink.officeId` to `CrmConnection` with cascade, so a refresh can't re-create a link after a disconnect.
- `linkedById` (SetNull) and `linkedByName` on manual links (ADR 0013).
- The P3 items from the review: zod on the `crm-link` POST, a leadId guard on relinks, re-saving clears `failedAt`, an unknown org id returns 404, seed idempotency, wording that distinguishes threads from leads.

## Research behind Q20 (2026-10-03)

| CRM                   | Verdict                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HubSpot free          | Free forever. Private-app token. One call creates the contact with an associated deal. `dealstage` webhooks with a v3 HMAC signature, retried for 24 h. Phone search drops the country code, which matters only for leads entered before Nhịp. No Vietnamese UI. |
| Attio                 | Cleanest API: matches phones in E.164 form, signed webhooks created via the API, free tier. No Vietnam presence, and Deals must be switched on by hand.                                                                                                          |
| Bitrix24              | Vietnamese UI and local partners. REST only on paid plans or a 15-day trial. Webhooks carry only an ID and aren't signed. Likely the second adapter.                                                                                                             |
| Pipedrive             | No free plan, unsigned webhooks.                                                                                                                                                                                                                                 |
| Zoho                  | No webhooks on the free plan.                                                                                                                                                                                                                                    |
| Getfly, Base.vn, MISA | No usable public deal APIs, or no stage-change events.                                                                                                                                                                                                           |

**Risks:**

- Duplicate leads from search-then-create; the idempotency lock and stored CRM ids handle it.
- Phone identity; `libphonenumber-js` plus the Zalo id property handle it.
- Lost webhooks; the reconcile handles it.
- Market fit vs demo fit; Q22 handles it.
