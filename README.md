# Nhịp

Working name only (pulse of the first reply). Not a brand lock.

Nhịp is a speed-to-lead product for high-end apartments in Vietnam. A lead writes an agency on WhatsApp or Zalo, often in Japanese, Korean, Russian or English. Nhịp turns that inbound into a reply in the guest's language within minutes, at any hour. A new guest gets a labelled automatic greeting within seconds, and a human agent approves every message after it. The guest only ever sees the agency's own number. Everything in the repo is invented data; nothing here is a real guest.

Product intention: [PRODUCT.md](./PRODUCT.md). Vocabulary: [CONTEXT.md](./CONTEXT.md).

## How it works

- A Next.js SaaS app (`apps/saas`) on one Postgres database. The office is the tenant.
- Guests arrive through pipes (Zalo, WhatsApp): a vendor webhook, verified, then stored as a thread in that office's Inbox.
- A new guest's first message gets an automatic reply (ADR 0021). The suggested reply is a template in the agent's own voice for the first reply; the model drafts later turns (ADR 0024).
- The agent reads the thread translated into the office language, edits the suggestion, and taps **Approve and send**: one guest message, one send, on the same pipe. Nhịp never sends a draft on its own.
- The model layer runs on OpenRouter with zero-retention routing and a daily cap per office; past a cap, templates and untranslated text (ADR 0024).
- The CRM seam keeps leads in the office's CRM through one adapter: a mock, or HubSpot (ADR 0003).
- One office language, English or Vietnamese, set by the manager for the whole office (ADR 0025).

The rest is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Run it locally

Setup, environment and commands are in [AGENTS.md](./AGENTS.md). In short: local Postgres, `.env.local`, `pnpm install`, `pnpm seed`, `pnpm --filter saas dev`. The app listens on **port 3010**: http://localhost:3010/en/inbox (or `/vi/`, when the manager has set the office to Vietnamese).

`pnpm seed -- --reset` rewrites the seed's invented guests as of now (needed after 48 hours). All logins use the password `walkthrough`:

| Login                                               | Who                                                     |
| --------------------------------------------------- | ------------------------------------------------------- |
| `ha@nhip.local`                                     | Manager, Hanoi Nest Seekers: sees every thread, assigns |
| `linh@nhip.local`, `duc@nhip.local`                 | Agents, Hanoi Nest Seekers                              |
| `admin@nhip.local`                                  | Platform admin: offices, pipe connections, invitations  |
| `river-manager@nhip.local`                          | Manager, the river office                               |
| `river-agent@nhip.local`, `river-agent2@nhip.local` | Agents, the river office                                |

## What you'll see

Sign in as an agent: the Inbox, a list of threads, and an open thread with the guest's messages translated, the suggested reply and **Approve and send** (mock send). Both roles also see Home, the funnel counted from Answers. The manager sees every thread and assigns the new ones. Hanoi Nest Seekers holds about forty invented guests in every state; the river office holds its own, and nothing crosses offices. There is no auth bypass and sign-up is closed.

## Docs

| File                                             | What it is                                       |
| ------------------------------------------------ | ------------------------------------------------ |
| [PRODUCT.md](./PRODUCT.md)                       | Locked product intention                         |
| [CONTEXT.md](./CONTEXT.md)                       | The glossary: what each word means               |
| [ARCHITECTURE.md](./ARCHITECTURE.md)             | System shape: tenancy, pipes, data, environments |
| [DESIGN.md](./DESIGN.md)                         | The visual system                                |
| [HANDOFF.md](./HANDOFF.md)                       | Cold start for any other agent or LLM            |
| [AGENTS.md](./AGENTS.md)                         | Setup, gates, conventions                        |
| [docs/adr](./docs/adr)                           | The decisions and their reasons                  |
| [docs/e2e-scenarios.md](./docs/e2e-scenarios.md) | The user-driven flows the E2E suite checks       |
| [CHANGELOG.md](./CHANGELOG.md)                   | What changed, newest first                       |
