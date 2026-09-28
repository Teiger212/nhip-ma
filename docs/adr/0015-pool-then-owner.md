# 0015. A thread starts in the office's pool and belongs to the agent who answers it

Date: 2026-09-27. Status: accepted. Extends ADRs 0008 and 0010; reverses CONTEXT's
"threads are shared".

## Context

Every agent in an office could see and answer every thread. The red team (T1,
`reports/audit-2026-09-27/`) showed how one compromised agent account exposes the whole
office's guests. Eyal wants each agent to hold their own guests. The risk is speed to lead,
which is the product: a new guest who belongs to one offline agent waits.

## Decision

- **Pool, then owner.** A new thread lands in the office's **pool**, visible to every agent,
  so whoever is available answers within minutes. The agent whose reply is sent first
  becomes the thread's **owner**. From then on it is in that agent's queue only.
- **Managers see every thread** and reassign owners. A manager is a member with the kit's
  `owner` or `admin` role; an agent is a `member`. No new role system.
- **Managers invite their own agents** through the kit's invitation screens (ADR 0010's
  "later step", brought into the advanced MVP). The **platform admin** creates the office and
  invites its first manager, and is never a member of an office: never a seat (ADR 0014),
  never sees guests' threads.
- **Home stays office-level.** Ownership is not a per-agent performance view.

## Considered options

- **Keep shared.** Simplest; T1's blast radius stays the whole office.
- **Strict assignment on arrival** (round robin or rules). Most private, but a new guest can
  wait on one agent's availability.

## Consequences

- `Conversation.ownerId` (nullable = pool). The claim happens in the Answer's transaction and
  only when no owner is set, so two agents racing for a pool thread end with one owner.
- The viewer carries the membership role. `listConversations` and `getConversation` return
  the pool, the viewer's own threads, or everything for a manager; every route reads through
  them, so the queue, counts, search and CRM links follow.
- A reply sent from the vendor's app (OA echo) claims nothing: the thread stays in the pool
  until a manager assigns it or an agent answers in Nhịp.
- The seed moves the platform admin out of the walk office and adds a manager login.
