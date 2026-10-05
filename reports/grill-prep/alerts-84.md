# Grill pack: #84 New-message alerts for agents

2026-10-04. Epic #103. Go-live #99 (2026-10-18) calls #84 "the largest code item".

## 1. What exists

**Decided in the docs (quoted)**

- PRODUCT: "a guest answered in minutes, at any hour". Milestone 4: "New-message alerts (web push, installable app)". "The queue, not the mailbox … nothing is dismissed."
- ADR 0015 (2026-09-30) says "No notification to the new owner until alerts (milestone 4)", so a reassignment alert is in scope. Also: "No automatic return to the pool … revisited, e.g. 'falls open after N minutes'".
- CONTEXT: "a colleague's threads do not exist for them". Alerts need the same visibility.
- The platform admin's membership "opens nothing", so the platform admin is never alerted.
- #99: "without alerts, an agent sees a message only with the inbox open … A new table, additive."

**Code**

- Inbound path:
  - `handleInboundWebhook` (inbox/lib/pipes/webhook.ts:16) calls `ingestEvents` (inbox/lib/inbox.ts:133).
  - That calls `afterGuestInbound` (inbox.ts:95) for guest messages (inbox.ts:151).
- **Duplicate trap:**
  - `upsertInbound` returns early on a known `vendorMessageId` (packages/database/inbox/store.ts:527), with no "inserted" flag (inbox/types.ts:325).
  - `ingestEvents` still calls `afterGuestInbound`, so a hook placed there alerts again on every vendor retry.
- `threadUrl()` (inbox.ts:76) is hard-coded to `/vi/inbox?thread=`.
- There is no realtime connection: the queue polls every 10s (inbox-queries.ts:30).
- There is no scheduler ("Retention without a scheduler", webhook.ts:69). #67's cron plan is "UNVERIFIED".
- The proxy matcher skips dotted paths (proxy.ts:19), so `/sw.js` would pass through it (inf.).
- None of these exist yet: a service worker, a manifest, push or VAPID code, `apps/saas/public` (verified by grep).

**Kit**

- `createNotification` (packages/notifications/src/create-notification.ts) writes a bell row (`IN_APP`) and sends an `EMAIL` through Resend.
- `NotificationTarget` has only `IN_APP` and `EMAIL` (schema.prisma:226).
- **Preferences are opt-out:** `isNotificationDisabled` is `Boolean(row)` (prisma/queries/notifications.ts:11). A new type therefore sends email by default.
- The bell is `NotificationCenter` (NavBar.tsx:166, AppWrapper.tsx:43). The settings page is `/settings/notifications`. The skill is `add-a-notification`.

**Platform facts (to verify)**

- iOS 16.4+ delivers web push only to a web app added to the Home Screen. Android Chrome delivers it in the browser.
- Web Push payloads are encrypted (RFC 8291), so FCM and Apple relay ciphertext. They still have to be named in the A05 dossier.
- VAPID keys are new Production env vars.
- Check `web-push` on npm before installing it.

## 2. What's undecided (design tree)

- Recipients (pool or owned) decide escalation, which needs a scheduler.
- The channel decides the kit fit (a `PUSH` target or a separate sender) and the PDPL content.
- Burst handling, quiet hours, the bell (ADR 0004), permission and install (iOS), and the E2E transport (`SEND_MODE`) come next.

## 3. UI/UX shape

**Who sees what**

- **Agent**: alerts for pool threads and their own threads, plus "given to you".
- **Manager**: pool alerts. Owned threads only through Waiting now, until escalation exists.
- **Platform admin**: nothing.
- **Guest**: never sees anything.

**Surfaces**

- (a) An Inbox alerts panel on the canvas, above the list panel (The Canvas And Panel Rule).
- (b) A "This device" row on `/settings/notifications`, with a Send test alert button.
- (c) The OS alert.
- (d) The tab title `(3) Inbox` and the installed app's badge.
- (e) "A colleague answered this guest", when a pool alert is opened after someone else claimed the thread. Today that open returns a 404.

**States of the alerts panel**

- Ask: a Dispatch Blue pill.
- iPhone, not installed: install steps.
- Denied: how to unblock.
- On: the panel is hidden.
- Subscription expired (410): ask again.
- Loading: nothing is rendered.

**Rules:** counts are amber, never red (The Red Means Broken Rule). One blue pill per action (The Pill Acts Rule). Status is a squared Badge.

**Copy tone.** A fact, not a nudge: "Minji is waiting · Zalo · Korean", or "Minji đang chờ · Zalo · tiếng Hàn". No "urgent", no "!". The copy follows the operator's locale, which also fixes the `vi`-only link.

```
Inbox, phone (alerts off)
┌ canvas ───────────────────────────────┐
│ Get an alert when a guest writes.      │
│ (  Turn on alerts  )   Not now         │
├ panel ────────────────────────────────┤
│ [MJ] Minji          09:41             │
│      Annyeong… I'm looking for a 2BR  │
│      [Zalo] [Pool] [Your turn]        │
└───────────────────────────────────────┘

Lock screen
┌───────────────────────────────────────┐
│ Nhịp                             now   │
│ Minji is waiting                       │
│ Zalo · Korean · Pool                   │
└───────────────────────────────────────┘
(one per guest; a new message replaces it)
```

## 4. Round 1

**1. Who is alerted when a pool guest writes?**

- Options: (a) every agent and manager; (b) agents only; (c) round robin.
- **Rec: (a).** The pool is for "whoever is available", and managers in a small office answer too.

**2. Who is alerted when the guest on an owned thread writes?**

- Options: (a) the owner only; (b) the owner and every manager; (c) the owner, then managers after N minutes.
- **Rec: (a) now.** (c) needs a scheduler, which we don't have.

**3. Which channel for go-live?**

- Options: (a) web push plus the tab and app count; (b) also email; (c) also Zalo to the agent.
- **Rec: (a).** The kit's opt-out default would send one email per guest message, in plain text through Resend, into spam. Zalo means paid ZNS and guest data on a third pipe.

**4. What may an alert say?**

- Options: (a) "A guest is waiting"; (b) name, pipe and language; (c) (b) plus the message text.
- **Rec: (b).** The translation isn't ready when the alert fires, so the Korean original is useless to the agent. The payload is encrypted. The lawyer check stays open.

**5. A guest sends five messages in 20 seconds. What happens?**

- Options: (a) one alert per message; (b) one per thread (`tag` = thread id), sounding again only after 2 minutes of quiet; (c) a digest.
- **Rec: (b).** An `inbox_alert` row (user, thread, at) gives the 2-minute check without a timer.

**6. Quiet hours?**

- Options: (a) none; (b) per user; (c) office hours.
- **Rec: (a).** "At any hour" is the product, and the phone's Do Not Disturb covers the person.

**7. Does the kit's bell carry per-message alerts?**

- Options: (a) yes; (b) no: per-message alerts are push only, and the bell carries "A manager gave you a thread".
- **Rec: (b).** A bell row per message is a second mailbox, which ADR 0004 rules out.

**8. Where is permission asked?**

- Options: (a) the browser prompt on page load; (b) the Inbox canvas panel and the settings device row; (c) an onboarding step.
- **Rec: (b).** Browsers punish prompts on load, and the panel can show the iPhone install steps.

## 5. Later rounds

- Escalation: "falls open after N minutes", or a manager alert. This needs the cron decision (#67).
- Skip the push while the operator is viewing that thread. Safari punishes silent pushes.
- Managers' opt-in to owned threads (a kit `PUSH` preference).
- Email fallback for an operator with no device subscribed: no guest name, a link only.
- Zalo OA admin app overlap (inf.: it may alert already, and a reply sent there claims nothing).

## 6. Go-live cut

**Must ship by 2026-10-18 (about 3.5 days)**

- `PushSubscription` table (cascade on user delete, ADR 0013) and an `inbox_alert` log, both additive. 0.5 d.
- `upsertInbound` returns `inserted`, and the alert fires only on an inserted guest message, in `after()`. 0.25 d.
- Recipients: pool goes to every operator, owned goes to the owner, reassignment goes to the new owner (push plus a bell row, email off). 0.5 d.
- Service worker, `app/manifest.ts`, VAPID, `web-push` sender, 410 cleanup. 0.75 d.
- Alerts panel, device row, test alert, tab count, the colleague-answered state, EN/VI copy. 0.75 d.
- Mock transport under `SEND_MODE=mock` that writes `inbox_alert` only. 0.25 d.
- E2E, 0.5 d:
  - a pool guest alerts every agent and manager;
  - an owned guest alerts only the owner;
  - a reassignment alerts the new owner;
  - a vendor retry alerts no one;
  - a burst makes one alert;
  - the platform admin is never alerted.
- Eyal: VAPID keys in Production, and the push services added to A05 and to #99's env list.

**After go-live:** escalation and the scheduler, email fallback, app badge, sound, a device list, suppressing the push while the thread is open, and native apps (#124).

## Decided (Eyal, 2026-10-04)

**Round 1, as recommended, with Q3 revised:**

- **Q1, pool guests:** every agent and manager is alerted.
- **Q2, owned threads:** only the owner.
- **Q3, the channel:**
  - Web push is the alert.
  - In-app signals alongside it: the tab title count, a toast while the app is open, and the kit's bell only for "a manager gave you a thread" (email off).
  - **No email.** Zalo and WhatsApp to the agent are not at go-live. Native apps (#124) later only change the transport.
- **Q4, content:** the guest's name, pipe and language, in the operator's language. No message text.
- **Q5, bursts:** one alert per thread (`tag` = thread id). A new one replaces the old, and it sounds again only after 2 minutes of quiet, checked against an `inbox_alert` log.
- **Q6:** no quiet hours.
- **Q7:** per-message alerts are push only; the bell carries reassignments only.
- **Q8, asking permission:** an Inbox panel (with iPhone Home Screen install steps), plus a "This device" row in notification settings with "Send test alert". Never a prompt when the page loads.

**Round 2:**

- **Q1, the alert opens after a colleague claimed the thread:** the Inbox shows a neutral notice, "A colleague is answering this guest", and nothing of the thread.
- **Q2:** the push is always sent at go-live. Suppressing it by presence comes after.
- **Q3:** "Not now" brings the panel back on that device after 7 days.
- **Q4:** every subscribed device gets the alert. Signing out removes that device's subscription. Deleting the account cascades (ADR 0013).
- **Q5, escalation:** deferred to a proper discussion (#131). For now a thread stays with its agent.

**Engineering facts that bind:**

- `upsertInbound` must report `inserted`, and the alert fires only for an inserted guest message, in `after()`.
- `threadUrl` follows the operator's locale.
- The platform admin is never alerted.
- A mock transport under `SEND_MODE=mock` writes only `inbox_alert`, for E2E.
- **Eyal's items:** VAPID keys in Production, and the push services (Apple, Google) named in the A05 dossier.

**Round 3 (Eyal, 2026-10-04, as recommended):**

- **A1:** a thread returned to the pool alerts the pool, as a new pool guest does.
- **A2:** a manager who assigns a thread to themselves isn't alerted.
- **A3:** a nameless guest reads "A guest is waiting" ("Một khách đang chờ"), never their Zalo id or phone.
- **A4:** an operator with no locale gets Vietnamese.
- **A5:** a device keeps alerting until sign-out, the end of the account, or the push service's 410. Firefox and Edge are allowed, so A05 names Apple, Google, Mozilla and Microsoft.
- **A6:** in-app toasts show only when the operator isn't looking at the Inbox list. One per guest, replaced like the push, at most 3 visible, and tapping opens the thread. Toasts use the kit's Base UI Toaster; no new library. Push sending is `web-push`, the only new dependency.

**From the check of the drafts, binding engineering:**

- **Payload:** the payload and tag carry an opaque alert id, never the thread id (which holds the WhatsApp phone). The url `/<locale>/inbox?alert=<id>` resolves on the server.
- **Bursts:** the sounding decision runs under `pg_advisory_xact_lock(user, thread)`.
- **Sign-out:** a before-hook removes the session's device.
- **E2E:**
  - permission is set by `addInitScript`;
  - CI and dev get a throwaway VAPID pair;
  - the migration and reader land unwired before the red run.
- **The bell row** names no guest.
- **Push options:** `userVisibleOnly`, a short TTL, `Cache-Control: no-cache` on `/sw.js`, and no `renotify` on iOS.
