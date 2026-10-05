# 0015. A thread starts in the office's pool and belongs to the agent who answers it

Date: 2026-09-27. Status: accepted. Extends ADRs 0008 and 0010; reverses CONTEXT's
"threads are shared". "Pool, then owner" is superseded by ADR 0022 (2026-10-05): managers
assign every new lead, and agents see only their own threads. The rest stands as ADR 0022
lists it.

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

## Amendment (2026-09-28): the platform admin's membership is inert

The kit (Better Auth) makes whoever creates an office its owner member, and has no way to
create an office without one. Rather than replace the kit's office flows, the platform
admin keeps that membership, and it opens nothing: no Inbox, Home or threads (the inbox
refuses them before resolving an office), not a seat, not listed among the office's members,
and they land in the admin area. "Never a member" in this ADR reads as "never an operator".

## Amendment (2026-09-30): pool then owner, settled before building

- **Manager** = an office member with the kit role `owner` or `admin`; **agent** = `member`.
  The platform admin is refused before any membership is read, so their inert owner
  membership never makes them a manager. An office's first manager is invited as kit `admin`
  (the platform admin holds `owner`, and only `owner` deletes an office). Several managers per
  office are fine.
- **Claiming** happens when an operator approves a pool thread's first reply, in the Answer's
  transaction, whether or not the send then succeeds; a failed send keeps the owner. A
  manager's approval claims too. A reply sent from the WhatsApp or Zalo app claims nothing.
- **No automatic return to the pool** for now: an owned thread stays with its owner however
  long the guest waits; a manager reassigns by hand. This accepts a speed-to-lead risk
  (an owner asleep or away) to be revisited, e.g. "falls open after N minutes".
- **What an agent sees**: the pool and their own threads, labelled "Pool" and "Yours"; a
  colleague's threads do not exist for them (not listed, counted, searched or opened, 404).
  Managers see every thread with its owner's name. Home stays office-level for everyone.
- **Reassign**: managers only, to any operator of the office or back to the pool; agents
  never hand threads on. When an owner's account ends (ADR 0013) their threads return to the
  pool. No notification to the new owner until alerts (milestone 4); superseded by ADR 0019:
  the new owner is alerted, and a thread returned to the pool alerts the pool.
- **Rollout**: existing threads are backfilled once: a thread with a sent Answer belongs to
  the operator who approved its first sent Answer, if still an operator of that office;
  everything else starts in the pool.
- **UX**: an ownership flag on every row and thread header; the manager's Owner dropdown in
  the thread header (immediate, no confirmation); a manager's Inbox filter All / Pool / an
  operator; a new agent's empty pool says so.
- **Seed**: the walk office has two agents (`walk@`, `walk2@`) and a manager (`manager@`,
  kit `admin`); the demo threads cover every state (one per agent, two in the pool).
- **Interactions**: the disconnected-pipe banner stays office-wide (it names no guest); red-team
  T1's reach is now the pool plus the agent's own threads; the CRM seam must read threads
  through the same visibility before it merges.

## Amendment (2026-10-03): only managers link a thread to a CRM lead

ADR 0003's amendment of the same date: a thread's CRM link is set or removed by hand by
managers only; agents see the CRM status read-only. The CRM link reads threads through the
same visibility as everything else, so an agent never sees a colleague's thread's lead. A
resolved thread (won or lost) leaves its owner's queue like any other until the guest writes
again; resolution changes no ownership.
