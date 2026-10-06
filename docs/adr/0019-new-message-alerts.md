# 0019. A guest's message alerts the operators who can open the thread, by web push

Date: 2026-10-04. Status: accepted. Extends ADRs 0004 and 0015; supersedes ADR 0015's "No
notification to the new owner until alerts (milestone 4)". "Who" is amended by ADR 0022:
read "pool" as Unassigned, whose guest alerts the office's managers only, and read "a
reassignment" as any assignment. The tab title is amended below (2026-10-06): "(n) <Page> –
Nhịp". ADR 0023 (2026-10-06, built after go-live) gives Nhịp the scheduler this ADR lacked; the
alert stays in `after()` until its fan-out moves onto a job.

## Context

Speed is the product: a guest answered in minutes, at any hour. Today an agent sees a new
message only with the Inbox open (it polls every 10 seconds); there is no realtime
connection, no scheduler and no push. Agents work on a phone between viewings as much as
at a desk. The kit's notifications module writes a bell row and sends an email, and its
preferences are opt-out, so any new kit type emails by default. (Since #148,
`createNotification` emails only the kit's welcome; every other type is a bell row only,
and a broken pipe is a bell row too: ADR 0017's amendment.) A vendor retries a webhook
until it is answered, and today a retried guest message runs everything after it again. A
thread's id carries the guest's WhatsApp phone, so it must not travel in an alert.

## Decision

- **Who.** A guest message on a pool thread alerts every operator of the office (agents and
  managers); so does a thread a manager returns to the pool. On an owned thread it alerts the
  owner only. A manager's reassignment alerts the new owner. Whoever acts is never alerted
  for their own action: not the manager who returns a thread to the pool, nor one who gives a
  thread to themselves. The platform admin is never alerted: their membership is the kit's
  `owner` role and opens nothing (ADR 0015), so recipients exclude them by
  `isPlatformAdmin(user.role)`, not by member role.
- **How.** Web push is the alert, from an installable web app (a manifest and a service
  worker). Every device the operator turned alerts on for gets it, until they sign out there,
  the account ends (ADR 0013) or the push service answers 410. Alongside it: the Your-turn
  count in the tab title, and in-app toasts when the operator is not looking at the Inbox
  list. The kit's bell carries one thing only, "a manager gave you a thread", naming no guest,
  with its email off. No email, and no Zalo or WhatsApp to the agent.
- **What an alert says.** The guest's name, pipe and language, in the operator's language
  (Vietnamese when they have none set): "Minji is waiting · Zalo · Korean". A guest with no
  name is "A guest", never their Zalo id or phone. No message text: the translation is not
  ready when the alert fires. Payloads are encrypted end to end (RFC 8291); Apple's, Google's,
  Mozilla's and Microsoft's push services relay ciphertext and are named in the A05 dossier.
- **Nothing of the thread's identity leaves Nhịp.** The payload and its link carry an opaque
  alert id; `/<locale>/inbox?alert=<id>` is resolved to the thread on the server, for that
  operator only.
- **Bursts.** One alert per thread: a new one replaces the last. It sounds again only after 2
  minutes of quiet on that thread for that operator, decided against an `inbox_alert` log
  inside a transaction holding `pg_advisory_xact_lock` on (operator, thread), so two messages
  at once cannot both sound. No quiet hours: the phone's Do Not Disturb covers the person.
- **Only new messages.** The store reports whether an inbound was inserted; a vendor retry of
  a message already stored alerts no one. The alert is sent in the background (`after()`).
- **Asking.** Never a browser prompt on page load. The Inbox shows an alerts panel on the
  canvas (with the iPhone's Add to Home Screen steps); "Not now" hides it on that device for 7
  days. Notification settings get a "This device" row with "Send test alert".
- **Opening an alert for a thread a colleague has since claimed** shows "A colleague is
  answering this guest" and nothing of the thread.
- **In a mock deployment** (`SEND_MODE=mock`), alerts are decided and logged exactly as in a
  live one, and no push is sent. E2E judges alerts by that log.

## Considered options

- **Email as well, or instead.** The kit's default: one plain-text email per guest message
  through Resend, read late and landing in spam. Rejected.
- **Zalo or WhatsApp to the agent.** Where agents already look, but it means paid Zalo ZNS
  and guests' data on a third pipe. Later, if web push proves too weak.
- **A bell row per message.** A second mailbox beside the queue, which ADR 0004 rules out.
- **Alert the owner, then managers after N minutes.** Needs a scheduler Nhịp does not have;
  escalation is deferred to its own discussion (#131). For now a thread stays with its agent.
- **Skip the push while the operator is viewing the thread.** Fewer duplicate signals, but
  Safari penalises a push that shows nothing. Later.
- **The thread id as the link and tag.** Simplest, but it puts a WhatsApp phone on the push
  service and the lock screen's notification store.

## Consequences

- Two additive tables: `InboxAlert` (the log, and the opaque id an alert carries) and a push
  subscription per device, tied to the sign-in that made it and removed by a sign-out
  before-hook.
- `upsertInbound` returns whether it inserted. Its dedupe is backed by the unique
  `(conversationId, vendorMessageId)`, so two concurrent retries cannot both insert.
- The thread link follows the operator's locale; the CRM lead's link stays Vietnamese.
- One new dependency, `web-push` (npm 3.6.7). New env vars per environment: a VAPID key pair
  and its subject; CI and dev use a throwaway pair.
- iPhone operators get alerts only after adding Nhịp to the Home Screen (iOS 16.4+), and iOS
  ignores `renotify`, so whether a replacement sounds there is the platform's call.
- An owner who is asleep or away still holds the thread; their guest's later messages alert
  only them. Accepted until #131.
- Native apps (#124) later change only the transport; the recipients, content and burst rule
  stay.

## Amendment (2026-10-06, #212): the tab title names the page

Decided in the grill of 2026-10-06 (Q3). It replaces #136's "(n) Inbox" on every page.

- **The tab title is "(n) <Page> – Nhịp"**, for example "(6) Home – Nhịp" or "(6) Inbox –
  Nhịp": the count, then the page the operator is on, on every page.
- Pages are already titled "<Page> – Nhịp"; the count goes in front of that title.
- n is the nav's Your-turn count, as before. With nobody waiting the tab keeps the page's own
  title, as #136 built it.
