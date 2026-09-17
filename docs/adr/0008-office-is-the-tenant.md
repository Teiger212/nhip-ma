# 0008. The office is the tenant; threads are shared within it

Date: 2026-09-17. Status: accepted.

## Context

Threads are scoped by `ownerUserId`, a person. Pipes (the WhatsApp number, the Zalo OA)
and the CRM connection (ADR 0003) belong to an office, not a person. "Your turn" is only
an office queue if any agent can pick up any thread.

## Decision

- The **office** is the unit of tenancy. It owns its pipes, its CRM connection, its
  agents, and its threads.
- Threads are **shared** within the office. Any agent in the office can open, draft, and
  approve any thread. Nothing is private to an agent.
- The kit's organization (hidden for the walk) is the office. One agency with one office
  is the MVP shape; a multi-office agency is later, as several tenants under one billing
  account.
- Agent-specific ownership, assignment, or views come later, on top of office tenancy,
  never instead of it.

## Consequences

- `Conversation.ownerUserId` becomes `officeId` (or the organization id). The store's
  "unowned is visible to everyone" fallback goes away once every thread carries an office.
- Webhook-created threads take the office that owns the pipe the message arrived on,
  which replaces the `INBOX_OWNER_USER_ID` env fallback with a pipe-to-office mapping.
- Home (ADR 0001) is office-scoped by construction.
- The organization switcher stays hidden until a user belongs to more than one office.
