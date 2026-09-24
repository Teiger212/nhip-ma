# Nhịp

Working name only: pulse of the first reply. Not a brand lock.

Nhịp is for Hà Nội real-estate agents on expat and luxury inbound. A lead writes the agency. Nhịp drafts a useful first reply in the guest’s language (EN, JP, KO, RU, and others), does not promise deals Vietnamese law will not allow, flags foreigner paperwork, and waits. A human taps **Approve and send**, and the reply goes out on the same pipe; the guest still sees the agency number. Never auto-send. Nhịp is all-hours first reply, not night-only.

Local development uses invented threads only; nothing here is a real guest. Product intention: [PRODUCT.md](./PRODUCT.md); vocabulary: [CONTEXT.md](./CONTEXT.md).

## Run it locally

SaaS listens on **port 3010**, and auth sessions and inbox threads live in the same local Postgres. Setup, environment, commands and the seeded logins are in [AGENTS.md](./AGENTS.md); locale routing is in [ARCHITECTURE.md](./ARCHITECTURE.md).

Sign in as `walk@nhip.local` / `walkthrough` at http://localhost:3010/en/inbox or http://localhost:3010/vi/inbox. You should see Inbox with four invented threads (Minji, Yuki, Alexei, Thảo), extract fields, an **Operator note**, a reply, and **Approve and send** (mock send). There is no auth bypass; every route behind `(authenticated)` requires a real session.

The inbox API (`/api/conversations`, `/api/conversations/{id}`, `/api/conversations/{id}/approve`) returns 401 without a signed-in session. Approve claims the thread atomically before sending, so a double tap sends once.

Marketing, docs, admin, billing, and organizations are unused kit scaffolding; leave them unless asked.

## Docs

| File                                 | What it is                            |
| ------------------------------------ | ------------------------------------- |
| [PRODUCT.md](./PRODUCT.md)           | Locked product intention              |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How this repo is shaped               |
| [HANDOFF.md](./HANDOFF.md)           | Cold start for any other agent or LLM |
| [AGENTS.md](./AGENTS.md)             | Setup, gates, conventions             |
