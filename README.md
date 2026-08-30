# Nhịp on the kit chassis

Working name only (pulse of the first reply). Not a brand.

This repo is the Supastarter Next.js turbo tree (`apps/saas`, `apps/marketing`, `packages/ui`, `packages/database`). This walk ports the Nhịp inbox into `apps/saas` only. Do not land on marketing, auth, orgs, billing, kit dashboard, docs, admin, or settings.

Agency inbox: a lead writes the brokerage on Zalo OA or WhatsApp Cloud API. Nhịp extracts what is already in that inbound, drafts a first reply in the guest’s language, adds a VN or EN note for the agent (**For you**, not sent to the guest), flags paperwork without inventing Vietnamese law, and waits. A human taps **Approve and send**. Then — and only then — we send on the same pipe. The guest still sees the agency number. Never auto-send.

## Laptop walkthrough

SQLite file DB. No hosted Postgres. SaaS listens on **port 3010** (3000 is another app).

```bash
pnpm install
cp .env.local.example .env.local
pnpm seed
pnpm --filter saas dev
```

Open http://localhost:3010

You should see the inbox shell (one live left item: **Inbox**), four invented threads (Minji, Yuki, Alexei, Thảo), search by name or last inbound, extract / **For you** / **Reply** / **Approve and send** (mock send). Nothing here is a real guest.

Re-running `pnpm seed` skips threads that already exist. Delete `data/nhip.db` first if you need a fresh set.

`POST /dev/inbound` still exists for local simulation only. It is not in the UI. In production (`NODE_ENV=production`) that route returns 404.

Webhook routes stay (`/webhooks/zalo`, `/webhooks/whatsapp`). Default `SEND_MODE=mock`. No live send required.

`apps/marketing` and `packages/ui` stay in the turbo tree. Do not build or ship marketing or admin this walk.

## Data

New models in `packages/database` (Prisma + Drizzle postgres/mysql/sqlite): `Pipe`, `Conversation`, `Message`, `Qualification` (`rentOrBuy` split from move-in `timeframe`), `Draft` + crib, `Paperwork` flag, `Approval`, `Send`.

Walkthrough persistence is SQLite (`DATABASE_URL=file:./data/nhip.db`) via `packages/database/inbox`. Inbox rows are not stored on User / Org / Plan / Subscription.

## Auth

The default route is the inbox and does not require login. Kit auth, orgs, and billing remain in the tree but are not the walk.
