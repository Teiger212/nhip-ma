# 0003. Closings come from the office's CRM through one adapter seam

Date: 2026-09-17. Status: accepted.

## Context

Nhịp sees messages, not deals. A closing is a fact the office already records somewhere,
and different offices use different CRMs. Asking agents to mark outcomes by hand inside
Nhịp duplicates that record and drifts from it. Inferring outcomes from chat text is
invention, which the product refuses to do.

## Decision

Introduce a **CRM adapter** seam, shaped like the existing pipe adapters
(`apps/saas/modules/inbox/lib/pipes/`): one interface, one implementation per CRM,
product code never names a vendor.

The interface is small and read-mostly at first:

- `findLeadForConversation(conversation)`: match a guest (phone, Zalo id, name) to a CRM
  contact or deal.
- `outcomeFor(lead)`: open, won, or lost, with a date and an optional reason.
- `listOutcomes(period)`: what Home needs for the funnel without one call per thread.

Writing back (creating a lead when a guest first writes in) is a second step, behind the
same seam, once one CRM is read-integrated end to end.

Two adapters justify the seam: the first real CRM an office uses, and a **mock adapter**
backed by a small local table so development, tests, and offices without a CRM still get
a working funnel. The mock is also the fallback when matching fails.

## Consequences

- Home's closings and lost widgets read through the adapter, never from inbox tables.
- Guest identity matching (phone number formats, Zalo ids without phones) is the hard part
  and belongs inside each adapter, not in Home.
- Which CRM comes first is an open question for the interview; the seam does not depend on
  the answer.
- Credentials per CRM follow the pattern in `config.ts`: validated at startup, settled
  fields, no raw env reads downstream.
