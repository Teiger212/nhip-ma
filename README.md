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

Open http://localhost:3010/en/inbox — `/` goes to `/en/inbox`, then kit login (`/en/login`) if you are signed out. Vietnamese is `/vi/inbox`.

Sign in as `walk@nhip.local` / `walkthrough`. Kit login stays on. A commented
`WALK_BYPASS_AUTH=1` in `.env.local` is an optional local/tunnel walk flag
on the operator’s run only: `GET /api/walk-bypass` signs in that invented
demo session and redirects to `NEXT_PUBLIC_SAAS_URL` + `/{locale}/inbox`. Off by
default. Never enable it in production, a leave-behind, or a public deploy.
For a Cloudflare quick tunnel, also set `NEXT_PUBLIC_SAAS_URL` to that
run’s `*.trycloudflare.com` origin (do not commit it). Inbox stays invented
threads + mock send. You should see kit chrome (hamburger Sheet on a phone, desktop sidebar), **Inbox** active in `NavBar`, four invented threads (Minji, Yuki, Alexei, Thảo), a search bar, extract / **For you** / **Reply** / **Approve and send** (mock send). Notifications and the user menu are kit chrome, not the walk. Nothing here is a real guest.

Language uses next-intl locale routes (`/en/inbox`, `/vi/inbox`) plus the kit cookie `NEXT_LOCALE`. Open the Walk Operator user menu (sidebar footer) and use **Language** / **Ngôn ngữ** with **EN** / **VI** only (`vi`, not `vn`). The toggle changes the path prefix. Inbox copy lives in `packages/i18n/translations/{locale}/saas.json` under `inbox.*`. Open `/vi/inbox` directly for Vietnamese.

`pnpm seed` is idempotent: it writes four invented threads once and skips IDs that already exist, and creates the walk user once when `DATABASE_URL` is Postgres. Run it from the repo root (threads still pin `data/nhip.db` if cwd is `apps/saas`). Delete `data/nhip.db` first if you need a fresh thread set.

`POST /dev/inbound` still exists for local simulation only. It is not in the UI. In production (`NODE_ENV=production`) that route returns 404.

Webhook routes stay (`/webhooks/zalo`, `/webhooks/whatsapp`). Default `SEND_MODE=mock`. No live send required.

`apps/marketing` and `packages/ui` stay in the turbo tree. Do not build or ship marketing or admin this walk.

There are no GitHub Actions workflows in this repo yet. Inbox unit tests live under `apps/saas/modules/inbox` (`pnpm --filter saas test`).

## Data

New models in `packages/database` (Prisma + Drizzle postgres/mysql/sqlite): `Pipe`, `Conversation`, `Message`, `Qualification` (`rentOrBuy` split from move-in `timeframe`), `Draft` + crib, `Paperwork` flag, `Approval`, `Send`.

Walkthrough thread persistence is SQLite (`data/nhip.db`) via `packages/database/inbox`. Inbox rows are not stored on User / Org / Plan / Subscription. Kit sessions use Postgres.

## Auth

Inbox is an authenticated account route (`/en/inbox` or `/vi/inbox`) inside kit `AppWrapper`. Sign in, then open Inbox. Organizations are not required (`requireOrganization` is false). Kit `hideOrganization` hides the org switcher so create-org is not in the walk chrome. Do not treat Reports, International, billing, or orgs as product features.
