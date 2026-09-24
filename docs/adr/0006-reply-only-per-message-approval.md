# 0006. Reply-only: every send answers one guest message

Date: 2026-09-17. Status: accepted.

## Context

Today a thread has at most one send and is then terminal (`sentAt`), so a guest who
writes back cannot be answered. Per-message approval fixes that, but "per message" has
two readings: sends that answer a guest message, or free sends the agent starts on their
own (a nudge). WhatsApp's 24-hour customer-care window forbids free-form nudges outside
the window and requires paid templates; Zalo has no such rule.

## Decision

- **Reply-only.** Every approved send answers exactly one guest message: one send per
  inbound. A second approve against the same inbound is refused (409), as a second send
  on a thread is today.
- The unit of approval is the **inbound message**, not the thread. `Approval` and `Send`
  record the inbound they answer. The thread's `sentAt` becomes "last office message at"
  and stops being terminal.
- **Your turn** therefore means "there is an unanswered inbound", which equals "the
  guest spoke last", the queue rule as already written.
- The atomic claim before transmit (from the audit remediation) moves from the thread to
  the inbound message.
- **Nudges are deferred.** They need WhatsApp template approval and a different queue
  state, and no pilot has asked for them.

## Consequences

- The store gains an `answersMessageId` on Approval and Send, and a unique index on it
  replaces the unique index on `Send.conversationId`. Existing files migrate on open.
- The funnel's "engaged" and "in conversation" counts follow directly: both are built
  from an approved send per inbound.
- Follow-up drafts (ADR 0005) are generated per unanswered inbound.
