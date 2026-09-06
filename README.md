# Nhịp

Working name only: pulse of the first reply. Not a brand lock.

Nhịp is for Hà Nội real-estate agents on expat and luxury inbound. A lead writes the agency. Nhịp drafts a useful first reply in the guest’s language (EN, JP, KO, RU, and others), does not promise deals Vietnamese law will not allow, flags foreigner paperwork, and waits. A human taps **Approve and send**. Then the reply goes out on the same pipe. The guest still sees the agency number. Never auto-send. Nhịp is all-hours first reply, not night-only.

This walk uses invented threads only. Nothing here is a real guest.

## Run the walk

SaaS listens on **port 3010**. Auth sessions use local Postgres. Inbox threads live in repo-root SQLite `data/nhip.db`.

```bash
pnpm install
cp .env.local.example .env.local
brew services start postgresql@16   # or: docker compose up -d postgres
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Open:

- English: http://localhost:3010/en/inbox
- Vietnamese: http://localhost:3010/vi/inbox

`/` goes to `/en/inbox`. Bare `/inbox` goes to `/{locale}/inbox`. Walk language is **en** and **vi** only (`vi`, not `vn`). Cookie-only locale without a path prefix is rejected.

Sign in as `walk@nhip.local` / `walkthrough`. You should see Inbox with four invented threads (Minji, Yuki, Alexei, Thảo), extract fields, an **Operator note**, a reply, and **Approve and send** (mock send).

`pnpm seed` writes those threads into `data/nhip.db` and creates the walk user when `DATABASE_URL` is Postgres. Re-run skips existing IDs. Delete `data/nhip.db` for a fresh thread set. Default `SEND_MODE=mock`.

The inbox API (`/api/conversations`, `/api/conversations/{id}`, `/api/conversations/{id}/approve`) requires a signed-in session and returns 401 otherwise. Approve claims the thread atomically before sending, so a double tap sends once. Inbound webhooks are rejected until `WHATSAPP_APP_SECRET` / `ZALO_OA_SECRET_KEY` are set. CI runs lint, format, type-check, and tests on every PR (`.github/workflows/ci.yml`).

Set `BETTER_AUTH_SECRET` (32+ characters) and a dummy `RESEND_API_KEY` so password login can start. `NEXT_PUBLIC_SAAS_URL` must be `http://localhost:3010` for this walk.

Optional local/tunnel only: `WALK_BYPASS_AUTH=1` then `GET /api/walk-bypass` signs in the invented walk session and redirects to `NEXT_PUBLIC_SAAS_URL/{locale}/inbox`. Off by default. Never enable it in production or a public deploy.

Do not build or ship marketing or admin this walk.

## Docs

| File                                 | What it is                            |
| ------------------------------------ | ------------------------------------- |
| [PRODUCT.md](./PRODUCT.md)           | Locked product intention              |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How this repo is shaped               |
| [HANDOFF.md](./HANDOFF.md)           | Cold start for any other agent or LLM |
| [AGENTS.md](./AGENTS.md)             | Setup, gates, conventions             |
