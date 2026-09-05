# Nhịp on the kit chassis

Working name only (pulse of the first reply). Not a brand.

This repo is the Supastarter Next.js turbo tree (`apps/saas`, `apps/marketing`, `packages/ui`, `packages/database`). This walk ports the Nhịp inbox into `apps/saas` only. Do not land on marketing, billing, docs, or admin this walk. Inbox uses kit auth chrome (`AppWrapper` / `NavBar`).

Agency inbox: a lead writes the brokerage on Zalo OA or WhatsApp Cloud API. Nhịp extracts what is already in that inbound, drafts a first reply in the guest’s language, adds a VN or EN note for the agent (**For you**, not sent to the guest), flags paperwork without inventing Vietnamese law, and waits. A human taps **Approve and send**. Then — and only then — we send on the same pipe. The guest still sees the agency number. Never auto-send.

## Laptop walkthrough

Kit login needs local Postgres. Inbox threads stay in SQLite `data/nhip.db`. SaaS listens on **port 3010** (3000 is another app).

```bash
pnpm install
cp .env.local.example .env.local
docker compose up -d postgres
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Open http://localhost:3010 — `/` goes to `/inbox`, then kit login if you are signed out.

Sign in as `walk@nhip.local` / `walkthrough`. You should see kit chrome (hamburger Sheet on a phone, desktop sidebar), **Inbox** active in `NavBar`, disabled **Reports** and **International**, four invented threads (Minji, Yuki, Alexei, Thảo), a search bar, extract / **For you** / **Reply** / **Approve and send** (mock send). Nothing here is a real guest.

Language uses the kit locale cookie `NEXT_LOCALE`. The kit Languages control in the nav footer and mobile Sheet includes Vietnamese (`vi`, not `vn`). On small viewports the labeled **Language** / **Ngôn ngữ** control also stays in inbox list/detail chrome. Inbox copy lives in `packages/i18n/translations/{locale}/saas.json` under `inbox.*`. To open Vietnamese without the switcher, set `NEXT_LOCALE=vi` and refresh.

`pnpm seed` is idempotent: it writes four invented threads once and skips IDs that already exist, and creates the walk user once when `DATABASE_URL` is Postgres. Run it from the repo root (threads still pin `data/nhip.db` if cwd is `apps/saas`). Delete `data/nhip.db` first if you need a fresh thread set.

`POST /dev/inbound` still exists for local simulation only. It is not in the UI. In production (`NODE_ENV=production`) that route returns 404.

Webhook routes stay (`/webhooks/zalo`, `/webhooks/whatsapp`). Default `SEND_MODE=mock`. No live send required.

`apps/marketing` and `packages/ui` stay in the turbo tree. Do not build or ship marketing or admin this walk.

There are no GitHub Actions workflows in this repo yet. Inbox unit tests live under `apps/saas/modules/inbox` (`pnpm --filter saas test`).

## Data

New models in `packages/database` (Prisma + Drizzle postgres/mysql/sqlite): `Pipe`, `Conversation`, `Message`, `Qualification` (`rentOrBuy` split from move-in `timeframe`), `Draft` + crib, `Paperwork` flag, `Approval`, `Send`.

Walkthrough thread persistence is SQLite (`data/nhip.db`) via `packages/database/inbox`. Inbox rows are not stored on User / Org / Plan / Subscription. Kit sessions use Postgres.

## Auth

Inbox is an authenticated account route (`/inbox`) inside kit `AppWrapper`. Sign in, then open Inbox. Organizations are not required (`requireOrganization` is false).
