# Red-team triage — 2026-09-27 (GPT-6-Astra, high, read-only, main @ 7baa32d)

Raw findings: `surface-1.json` (tenancy/auth, T1–T6), `surface-2.json` (send path, S1–S7). Each surface also lists 12 things that held (`checked_ok`).
Triage by Claude: T1–T4 re-checked against the code (config lines quoted below); the rest traced by the auditor, reproduction pending as part of each fix.

## Ranked (re-graded by what a person would suffer)

| #   | Id  | Grade                                | What                                                                                                                                                                                                                                    | Confirmed by                 |
| --- | --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | T1  | Critical                             | Anyone can sign up with an invited email before the invitee does, get a session (`autoSignIn: !enableSignup` = true, `requireEmailVerification` = false, `auth.ts:252-253`), plant a passkey, and later sign into the invitee's account | auditor + config             |
| 2   | S2  | Critical                             | A reply sent from the vendor's phone app during an approval does not stop a second Nhịp send (ADR 0011 "never twice")                                                                                                                   | auditor trace                |
| 3   | T4  | High                                 | Invitation-only sign-up is bypassed by magic link (`disableSignUp: false`, `auth.ts:292`) and, when configured, Google/GitHub; the invitation check matches only `/sign-up/email`                                                       | config                       |
| 4   | T3  | High                                 | Any signed-in user can create an office and own it: `enableUsersToCreateOrganizations: false` (`config.ts:21`) is never passed to Better Auth; it also lets a removed operator dodge ADR 0013                                           | grep                         |
| 5   | T5  | High                                 | Two invitations accepted at the same moment give one account two offices (the ADR 0010 guard is check-then-insert)                                                                                                                      | auditor trace                |
| 6   | S1  | High                                 | After a pipe is reassigned to another office, the old office can still approve and send from it                                                                                                                                         | auditor trace                |
| 7   | S3  | High                                 | Nested tags survive the prompt sanitizer, so a guest can forge "agent" lines in the draft prompt                                                                                                                                        | auditor reproduced in memory |
| 8   | T2  | High (Critical once billing is live) | Unauthenticated `POST /api/auth/organization/delete` cancels the office's subscriptions before Better Auth checks anything (`auth.ts:206-210`, kit code carried over)                                                                   | code                         |
| 9   | S4  | Medium                               | A late regeneration writes an older message's draft over the newer one's, and the operator can approve it as the answer to the newer message                                                                                            | auditor trace                |
| 10  | S5  | Medium                               | Duplicate webhooks and polling re-launch model work (credits, memory)                                                                                                                                                                   | auditor trace                |
| 11  | S6  | Medium                               | Webhooks read unlimited bodies before rejecting unsigned requests                                                                                                                                                                       | auditor trace                |
| 12  | T6  | Medium                               | Any member can overwrite the office logo through the upload URL                                                                                                                                                                         | auditor trace                |
| 13  | S7  | Low                                  | `SEND_MODE=" live "` counts as live                                                                                                                                                                                                     | code                         |

## Proposed fix batches (one PR each, in this order)

A. **Auth lockdown** (T1, T4, T3, T5, T2, T6) — all in `packages/auth` + one oRPC procedure. Account creation only by redeeming a valid invitation, on every path (password, magic link, OAuth); no session before email ownership; office creation for platform admins only; membership check and insert in one transaction; subscription cancellation moved after Better Auth's permission check; logo upload requires manage. Verification: live repro before/after over HTTP; the flows go to `docs/e2e-scenarios.md`; the membership-invariant logic gets a store test.
B. **Send safety** (S2, S1, S4, S7) — serialise echo/inbound and `beginAnswer` on the conversation row; re-check pipe ownership at approval; draft writes conditional on the current inbound; exact `SEND_MODE`. Store-level race tests (no user in them).
C. **Model input** (S3, S5) — encode delimiters instead of stripping tags (utility: unit tests with the auditor's payloads); skip downstream work for duplicate inbounds; bound translation backfill.
D. **Hardening** (S6) — reject unsigned webhooks before reading the body; byte limit → 413.

Notes: `feat/crm-seam` carries the same `auth.ts:206` hook (T2) — rebase it after A. ADR 0014 (billing) should land after A.

## Status

- **Batch A fixed** on `feat/m1-foundations` (2026-09-27). Live before/after on the dev server:
  T1 sign-up without the invitation link 200+session → 400 (with the link: 200; expired or
  someone else's id: 400); T3 agent creates an office 200 → 403 (platform admin: 200); T4
  magic link creates an account → no account. T5: two simultaneous accepts end in one office
  (`keepOldestMembership`, 3 Vitest tests + live race). T2: cancellation moved into
  `beforeDeleteOrganization`, after Better Auth's permission check. T6: logo upload needs
  `organization.manage`.
- **Found while fixing T1 (pre-existing):** Better Auth requires a verified email to accept an
  invitation, and closed sign-up sends no verification mail, so no brand-new invitee could
  join an office. A sign-up that redeems a valid invitation id now marks the email verified
  (the id arrives only in that mailbox).
- User flows recorded in `docs/e2e-scenarios.md` ("Auth"). Batches B, C, D open.
