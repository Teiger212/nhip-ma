# 0001. Two roles, two screens, both visible to everyone

Date: 2026-09-17. Status: accepted.

## Context

The user of Nhịp is the agent answering inbound; the customer is the manager who pays
for speed-to-lead. Their questions differ: "what is waiting on me" versus "how fast are
we and what are we losing". A product that serves only the agent has no story for the
buyer; one that serves only the manager is a dashboard nobody works in.

## Decision

- **Inbox** is the agent's working screen and stays a queue.
- **Home** is the numbers screen: widgets made of graphs (speed to first send, waiting
  guests, sends per day, language mix, and whatever else earns its place).
- Home is accessible to every operator. No role gating on read. Agents see the same
  numbers the manager sees.
- Home shows **office-level** numbers only: the whole office's speed, queue, and volume.
  There is no per-agent breakdown. Per-agent performance is a future feature, not a
  hidden one; it is deliberately not built yet.

## Consequences

- Home stops being a disabled placeholder in the sidebar and becomes the second working
  job after Inbox.
- The data behind Home already exists in the inbox store (inbound and send timestamps,
  languages, pipes); no new capture is needed for the first widgets.
- Permissions stay simple: roles are not modelled until something must be hidden.
- Threads already carry `ownerUserId`, so a per-agent view is possible later without new
  capture. Building it means deciding what an agent "owns" (the thread, or each send),
  which is why it is deferred.
- Metrics need definitions. "Speed" is undefined until ADR 0002.
