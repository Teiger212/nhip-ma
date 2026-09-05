# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are Hà Nội real-estate **agencies** working expat / luxury inbound (not mass-market brokerage, not a rental operator). Agency staff are the operators of the product.

Hạnh (friend who leases whole buildings) is a door for feedback and networking only — not the product user. Do not build for her.

## Product Purpose

Working cover name: **Nhịp**. Speed-to-lead for inbound guest messages: a lead comes in; a useful first reply goes out fast in that person’s language (EN, JP, KO, RU, VI, others as needed); a human still approves the send; foreigner paperwork is flagged in-product rather than shrugged.

Success for the agency: faster, safer first response without auto-send and without promising deals Vietnamese law will not allow.

## Positioning

Official inbound pipes only (Zalo Official Account + WhatsApp Cloud API / business inquiry number) into **one conversation** per guest, with a **one-shot** extract + draft + crib (“For you”) + paperwork flag, then **approve-and-we-transmit**. Guest still sees the agency number. Never auto-send. Never personal-Zalo / unofficial QR login. We do not become their OA agency.

## Operating Context

- All-hours first reply (daytime counts the same as night). Not a night-only desk.
- Agency works inside Nhịp; taps approve; we transmit on the official pipe.
- Tây Hồ / connected-v1 gate: personal-only shops are not a connected v1 customer unless they already have or will stand up an OA or business/inquiry number.
- This week’s GTM artifact is a slide deck plus **invented demo threads**, not software left with agencies. The current software walk is an inbox-only showcase on the Supastarter kit chassis (`Teiger212/nhip-ma`).

## Capabilities and Constraints

Confirmed / in walk:
- Inbox of invented threads (Minji, Yuki, Alexei, Thảo), search, qualification extract (`rentOrBuy` vs move-in `timeframe`), For you (crib, not sent to guest) above Reply, paperwork flag when mentioned, approve-and-send with `SEND_MODE=mock`.
- en + vi UI locale via kit next-intl; lucide-react icons; consume `@repo/ui` (no second design system).
- SQLite local walk on port 3010; auth/orgs/billing/marketing hidden for the walk.

Hard constraints:
- Never send messages to real guests, agents, or Hạnh; never log into her tools; never put customer data on a public Share link.
- Do not invent product shape, lock UI/brand/output template, or rebuild the old two-desk / stay-band / foreign-buyer cockpit / React MVP unless Eyal or VP of Product explicitly asks.
- Channels out of v1 scope: personal WhatsApp/Zalo, Kakao, LINE, email, SMS, unofficial warm SIMs.

Open / later (not this walk): live Zalo/WhatsApp webhooks, real agency onboarding, live send, Reports / International nav (disabled placeholders only).

## Brand Commitments

Working name in the GTM deck: **Nhịp**. Do not lock a brand system, color palette, or output template unless Eyal asks. Agency terminology in copy (never “shop”).

## Evidence on Hand

- Invented demo threads only — not real guests.
- Local walk: `Teiger212/nhip-ma`, `http://localhost:3010`.
- Architecture notes and GTM decks exist in working files; do not fabricate testimonials, benchmarks, or customer names.

## Product Principles

1. Human approves every outbound — never auto-send.
2. Official pipes only; guest still sees the agency number.
3. Extract what is already in the lead; missing stays missing; do not invent Vietnamese law.
4. Smallest walk that proves the bet; kit UI (`packages/ui`) over a custom design system.
5. Agency operator is the user; networking contacts are not users.
