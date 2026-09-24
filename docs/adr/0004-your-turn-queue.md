# 0004. "Your turn" is the only pending state; the queue empties through outcomes

Date: 2026-09-17. Status: accepted.

## Context

The inbox is a queue. "Needs reply" implied a judgment Nhịp cannot make: sometimes there
is nothing more to say. A guest's closing "thanks, talk Monday" is not work, but under
"Needs reply" it looks unfinished forever. A "no reply needed" button would fix the
number by letting agents dismiss threads, which makes the funnel lie.

## Decision

- A thread is **Your turn** when the guest spoke last. That is a fact, not a judgment;
  whether to reply is the agent's call.
- There is **no dismiss action** in v1. A thread leaves Your turn only through a send or
  a real outcome.
- Your turn is sorted oldest waiting guest first. Threads the guest last touched more
  than **48 hours** ago drop into a collapsed **quiet** section at the bottom of the
  queue: still Your turn, still one tap away, out of the way.
- A **won or lost outcome from the CRM** (ADR 0003) removes the thread from the queue.
  The conversation has a resolution and lives under Sent / All from then on.

## Consequences

- The queue count is honest: it goes down only when the office replies or closes.
- The 48-hour quiet threshold is a product constant, not a setting, until someone asks.
- Offices without a CRM connected have no outcome path, so their quiet section grows.
  That is acceptable for a pilot and a reason to connect the CRM, not to add dismiss.
- Follow-up drafts (ADR 0005, pending) make a second reply cheap enough that agents
  clear Your turn by replying rather than wishing for dismiss.
