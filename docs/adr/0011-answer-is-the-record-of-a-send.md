# 0011. An Answer is the record of a send

Date: 2026-09-20. Status: accepted. Refines ADR 0006.

## Context

Under ADR 0006 a send was four separate things: the approval request, an atomic claim
on the guest message, the vendor call, and an `Approval` plus a `Send` row written after
the call. Nothing existed between approval and record, and an outside audit showed what
slips through that gap:

- The approval carried only a thread id and text, so a guest message arriving a moment
  before the tap was answered with a reply written for the previous one; a cleared reply
  box silently sent the stored suggestion.
- One `try/catch` covered the vendor call and the record. A vendor success followed by a
  record failure released the claim, and the retry sent the same message twice.
- "Your turn" was read off message order. A guest message arriving mid-send was hidden
  the moment the outbound answering the earlier message was stored last.

## Decision

- **An Answer is the office's reply to exactly one guest message, on record from the
  moment the operator approves it.** One table, one row per inbound (unique), carrying
  the approved text, who approved, and a status: `sending` → `sent` | `failed` |
  `unknown`. It replaces the `Approval` and `Send` tables and the claim on `Message`.
- **An approval names its target and its text.** The request carries the inbound id and
  the exact text; a target that is no longer the open message is `409 stale_target`, a
  missing target `400 inbound_required`, an empty reply `400 empty_reply`. The reply box
  keys the operator's edit by the guest message, so a new message empties it.
- **The row is written before the vendor is called.** A concurrent approval of the same
  message is refused by the unique index. A definite refusal from the vendor, or missing
  credentials, is `failed` and may be approved again on the same row. A network failure
  or timeout, or a vendor success whose record failed, is `unknown`: never retried
  automatically, and refused (`409 delivery_unknown`) until a person has reconciled it
  against the vendor.
- **"Your turn" is derived from Answers, not message order.** The guest's latest
  message is unanswered unless an Answer in flight, sent or unknown exists for it, or
  the agent replied from the OA app after it.

## Consequences

- Files from before this decision migrate on open: each `Send` becomes a `sent` Answer
  (an old `Send` without a target first learns which message it answered, as in ADR
  0006); the `Approval` and `Send` tables and `Message.claimedAt` are dropped.
- The funnel (ADR 0002) and response time read Answers: "engaged" is a lead with a
  `sent` Answer, "in conversation" a guest message after one, response time the first
  Answer's `sentAt` against the first inbound.
- A manager review step, if it ever comes, is a status before `sending`; the enum has
  room and nothing else moves.
