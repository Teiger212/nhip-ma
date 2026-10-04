# 0003. Closings come from the office's CRM through one adapter seam

Date: 2026-09-17. Status: accepted.

## Context

Nhịp sees messages, not deals. The office already records each closing somewhere, and
different offices use different CRMs. Having agents mark outcomes by hand inside Nhịp
duplicates that record and drifts from it. Inferring outcomes from chat text is
invention, which the product refuses to do.

## Decision

Introduce a **CRM adapter** seam, shaped like the existing pipe adapters
(`apps/saas/modules/inbox/lib/pipes/`): one interface, one implementation per CRM,
product code never names a vendor.

The interface starts small and read-mostly:

- `findLeadForConversation(conversation)`: match a guest (phone, Zalo id, name) to a CRM
  contact or deal.
- `outcomeFor(lead)`: open, won, or lost, with a date and an optional reason.
- `listOutcomes(period)`: what Home needs for the funnel without one call per thread.

Writing back (creating a lead when a guest first writes in) comes second, behind the
same seam, once one CRM is read-integrated end to end.

Two adapters justify the seam: the first real CRM an office uses, and a **mock adapter**
backed by a small local table so development, tests, and offices without a CRM still get
a working funnel. The mock is also the fallback when matching fails.

## Consequences

- Home's closings and lost widgets read through the adapter, never from inbox tables.
- Guest identity matching (phone number formats, Zalo ids without phones) is the hard part
  and belongs inside each adapter, not in Home.
- **Attio is the first real adapter** (provisional, 2026-09-17: no pilot office has named
  its CRM yet; Attio is the placeholder because it has a clean REST API, phone and email
  attributes on people, and deals as a first-class object). Swap it when a pilot office
  says otherwise; the seam is the point.
- **Matching rule**: phone number normalised to E.164 first. With no match, the thread
  shows a manual "link to CRM lead" action; the agent picks the lead once and Nhịp
  remembers it. No name matching, ever: it is wrong often enough to poison the funnel.
  Zalo guests, who often carry only a Zalo user id, will usually take the manual path
  until the office stores Zalo ids in the CRM.
- Credentials per CRM follow the pattern in `config.ts`: validated at startup, settled
  fields, no raw env reads downstream.

## Amendment (2026-10-03): a real CRM for a demo, decided before building

Decided with Eyal after reviewing `feat/crm-seam` (`reports/crm-seam-plan-2026-10-03.md`,
Q1 to Q23). The spec is GitHub issue #59; its tickets carry the delivery order. The seam, the cached link per thread and the conditional writes stand. These
supersede the matching, write-back, refresh and Attio points above where they differ.

- **The demo CRM is HubSpot's free CRM** (Q20): free forever, recognised by buyers, a deal
  board where the closing shows, signed webhooks, and a contact with its deal written in two
  calls (2026-10-03, #65: first written here as one call; HubSpot's API takes the contact,
  found or created, then the deal with an inline association to it). Attio is dropped as the
  default; Bitrix24 is the likely second adapter for Vietnam, built only after beta agencies
  name their CRM (Q22). The demo pipe is Zalo (Q23); its inbound is a real pipe, rehearsed
  locally against a HubSpot sandbox (Q17). Staging only: production stays on the mock until a
  beta agency names its CRM (Q2).
- **Write-back comes first, with reading** (Q2, Q11 to Q15). The guest's first message
  creates the lead, for every new guest: the contact (name, phone, Zalo user id) and its
  deal, which carries the thread's own details (pipe, language, the extracted fields, a link
  to the thread; never message transcripts), since one thread is one deal (#65). A phone
  already in the CRM reuses the contact; a new deal is created only if that contact has no
  open deal, otherwise the thread links to the open one. A contact Nhịp creates stores the
  Zalo user id in a custom property, so later lookups match without a phone. Deals start
  unassigned. A failed write retries with backoff and a cap; managers see "Not in CRM yet";
  the guest and the queue never wait on it (Q16).
- **Resolved ends when the guest writes after `outcomeObservedAt`** (Q3), the time Nhịp
  first saw the outcome: not the CRM's close date (a backdated close must not hide a guest
  who wrote meanwhile), and not the last check. The same outcome seen again keeps its first
  observation; a different one is observed anew. A decided outcome with no observation time is
  not resolved: it fails open, so missing data never hides a guest.
- **No fetch on view** (Q4). Webhooks
  update the cached outcome at once; an hourly reconcile per office, single-flight behind a
  lease (`CrmConnection.refreshedAt`), catches what a webhook missed. The inbox's 10 s poll
  never calls the CRM. Home never waits on the CRM either: it shows cached closings and lost
  with an "as of" time (Q5).
- **Managers link and unlink by hand; agents see the CRM status read-only** (Q1; replaces
  "the agent picks the lead"). To be revisited with UX; Zalo-id matching removes most manual
  links anyway.
- **Matching never guesses.** E.164 through `libphonenumber-js` with Vietnam as the default
  region (Q19); a guest matching two leads is linked to neither, and no lead is added (#61).
- **Credentials are encrypted per office**, like pipe credentials (ADR 0017): a HubSpot
  access token entered by the platform admin in the office's Connections card, next to Zalo
  and WhatsApp (Q6, Q18), stored write-only. HubSpot no longer lets new accounts create
  legacy private apps (2026-09-28), so the token is that of Nhịp's own app: a HubSpot CLI
  project with static auth and private distribution, which installs on one standard account
  (the demo portal) plus up to ten test accounts (#65). Static auth cannot reach every
  office's account, and an app's auth type is fixed at its first upload, so the demo app has
  a project name of its own and the production app is a separate OAuth app, built when a
  second agency uses HubSpot. Its exchange and refresh can come from Better Auth's
  `genericOAuth` HubSpot provider, with the tokens copied into the same per-office
  credential, since Better Auth keeps them per user and an office's account is not one
  user's (2026-10-03).
- **Won and Lost are neutral badges** in place of the turn while a thread is resolved
  (DESIGN.md).

Pending (2026-10-04): Attio is the first client's CRM (#101); its amendment follows the grill,
see `reports/attio-research-2026-10-04.md`.

## HubSpot accounts (2026-10-03)

- Legacy private apps are gone for new accounts; their replacement, service keys, has no
  webhooks. Hence Nhịp's own app above.
- The demo portal, 149475387, is in HubSpot's EU data centre: cross-border under PDPL, the same
  A05 filing as the rest.
- The developer test account is 149475500 (`nhip-crm-dev`).

## Considered

- Integration platforms (Composio, reviewed 2026-10-03): rejected; one adapter per CRM.
  Revisit Nango when 3+ paying offices use 3+ CRMs.
