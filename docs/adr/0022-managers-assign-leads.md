# 0022. Managers assign every new lead; agents see only their own threads

Date: 2026-10-05. Status: accepted. Supersedes ADR 0015's "Pool, then owner": the pool every agent
sees, and the claim by first answer for agents. Amends ADR 0019's "Who". Keeps the rest of ADR 0015. Decided in the grill of 2026-10-05 (`reports/grill-prep/first-touch-and-assignment.md`:
M1–M3, R5, R6, and round 4's P1, P4 and S2). A manager's count line and turn chip are amended
below (2026-10-06).

## Context

ADR 0015 put a new thread in a **pool** that every agent sees. The first agent to answer
owned it. ADR 0015 rejected strict assignment because "a new guest can wait on one agent's
availability".

Two things have changed since:

- **The guest no longer waits in silence.** ADR 0021 greets every new guest within seconds,
  so a guest who isn't answered yet has at least heard back.
- **Eyal wants managers to decide who serves whom,** as raised while exploring #134. A pool
  that races agents also shows every agent every new guest; red team T1 measures that as the
  reach of one compromised agent account.

## Decision

- **Unassigned (M1).** A new lead lands in **Unassigned**, which is a thread with no owner
  (`ownerId` null, the pool's own column).
  - **Managers only** see Unassigned.
  - **Agents see only threads assigned to them.** Unassigned and colleagues' threads don't
    exist for an agent: not listed, counted or searched, and opening one is a 404.
  - There is no pool any more. The word goes, everywhere.
- **The manager assigns (M1, M3).** Any manager can assign an Unassigned lead, or reassign a
  thread, to any operator of the office (an agent or a manager, never the platform admin),
  or return it to Unassigned, at any time.
  - The last assignment wins.
  - Agents never hand threads on.
- **Alerts (M2, amends ADR 0019's "Who").**
  - A guest message on an Unassigned thread alerts the office's **managers only**. As before,
    that leaves out the platform admin, by platform role, and anyone who belongs to two
    offices. This replaces the pool rule merged in #132.
  - A thread returned to Unassigned alerts the managers, except the manager who returned it.
    This follows from recipients equalling visibility (S2).
  - An assignment or reassignment alerts the chosen operator, unless they chose themselves
    (#133, with its bell row).
  - A guest message on an owned thread alerts the owner only, as before.
  - **The previous owner (P4).** When a manager moves a thread away from an operator, by
    reassigning it or returning it to Unassigned, that operator gets a bell row naming the
    guest: "Minji Kim was moved to another agent".
    - No push.
    - The row's `data` carries the thread's opaque id, `{ threadId }`.
    - Guest deletion (#138) deletes such rows.
    - Naming the new owner comes after the MVP.
  - The rule that recipients equal visibility stands: nobody is alerted about a thread they
    can't open.
- **The screens (R5).**
  - **Managers' Inbox:** an **Unassigned** view comes first, oldest first. "Assign to…"
    appears on each row and in the thread header's owner menu (the header's menu is today's
    Owner control, renamed).
  - **Home:** a manager's Waiting now lists Unassigned leads first.
  - **Agents:** an agent sees only their own threads. With none, the Inbox reads "Nothing
    assigned to you yet."
- **A lead nobody assigns (R6).** It waits, with the greeting sent (ADR 0021) and the managers
  alerted. Escalation is #131's discussion.

### What still holds from ADR 0015

- **Roles.** A manager is a member with kit role `owner` or `admin`, and an agent is a
  `member`. The platform admin's membership opens nothing.
- **Inviting.** Managers invite their own agents.
- **Home** stays office-level for everyone.
- **App replies.** A reply sent from the WhatsApp or Zalo app assigns nothing.
- **Ending accounts.** When an owner's account ends (ADR 0013), their threads return to
  Unassigned.
- **No automatic return.** An owned thread stays with its owner however long the guest waits.
- **The CRM link** is set by managers only.
- **No confirmation.** The header's owner menu acts at once.

## Considered options

- **Keep the pool (ADR 0015).** Whoever is free answers first, but every agent sees every new
  guest, and nobody decides who serves whom.
- **Assign automatically** (round robin or rules). Not asked for. It needs rules per office.
- **Pool for agents, with managers assigning too.** Two ways in, and agents still see every
  new guest.

## Consequences

- **Visibility.** `visibleTo` and `visibleSql` (`packages/database/inbox/store.ts`) give an
  agent `ownerId = viewer.userId` only, and a manager the whole office. Every route already
  reads through them, so the queue, the counts, search, Waiting now, the CRM links and the
  `?thread=` links follow.
- **Recipients.**
  - `officeOperators` also returns each operator's member role.
  - `guestAlertRecipients` sends an Unassigned thread's message to managers.
  - This ships in the same change as the visibility change, so recipients never outrun what
    an operator can open.
- **A manager's reply makes the lead theirs (P1).** The claim stays in `beginAnswer`: a
  manager who approves a reply on an Unassigned lead becomes its owner, as the code does
  today, and can reassign it at any time. Only managers can reach that claim now, since
  agents can't open an Unassigned thread.
- **Last wins without new code.** `setOwner` is an unconditional update. The first-chosen
  agent's `assigned` alert goes stale, and opening it shows #136's neutral notice.
- **No data migration.** At deploy, today's pool threads become Unassigned, and agents stop
  seeing them. The deploy note tells managers to assign them.
- **Seed.** Alexei and Thảo become Unassigned and are seen only by `manager@`.
- **E2E.** Every spec in which an agent acts on a new guest assigns the thread first, as the
  manager, through the owner API. A support helper does it.
- **The risk moves.** With the greeting off (ADR 0021, G6), this is exactly the option ADR
  0015 rejected. The risk is no longer "one agent away" but "every manager away"; #131 owns
  it.
- **Red team T1** shrinks to an agent's own threads.
- **Docs.** CONTEXT.md, PRODUCT.md, DESIGN.md and the scenarios change. Unassigned is a new
  term, and Pool goes.

## Open

None. P1, P4 and S2 were decided in round 4 (2026-10-05).

## Amendment (2026-10-06): a manager's count line, turn chip and Waiting view

Decided in the grill of 2026-10-06, from Eyal's UI walk of main (Q1, Q2, Q15, Q16).

- **The count line (Q1, #208).** A manager's count line under the Inbox's view tabs reads, for
  example, "4 unassigned · 6 waiting in the office".
  - "Waiting in the office" includes the unassigned guests.
  - Built for #208 in PR #209 (open when this was written), with wording per view.
  - Agents keep "N guests are waiting on you".
- **The turn chip (Q2, #212).** A manager sees "Your turn" only on the threads they own.
  - On a thread another operator owns, and on an Unassigned thread, the chip reads
    **"Waiting"**.
  - Agents are unchanged: every thread they see is their own.
- **The manager's view is named "Waiting" (Q15, #210).** A manager's view of every guest the
  office owes a reply is labelled **"Waiting N"**, not "Your turn N". It holds the same
  threads, and its count is the same office-wide number as the nav badge, the tab title and the
  count line. Agents keep "Your turn".
- **The office Billing page is hidden (Q16, #210).** It goes in `kit-screens.ts` with the
  account Billing page, hidden and not deleted, until ADR 0014's billing is built (#198).
