# Grill pack: onboarding a new agency (#104)

2026-10-04. #104, #128, #81, #82; go-live #99 2026-10-18. Paths under `apps/saas/` unless noted.

## 1. What exists

**Decided**

- CONTEXT: "**Office setup**: the platform admin's single step that creates an office and invites its first manager. Operators never create, switch or leave offices."
- ADR 0015: "**Managers invite their own agents** through the kit's invitation screens"; first manager is kit `admin` ("only `owner` deletes an office"); "Several managers per office are fine."
- ADR 0017: platform admin connects pipes "with the agency person who owns the number or OA present"; manager-connects is "good enough later".
- ADR 0018: "the office's name is the app's name; later, each office gets its own subdomain"; the admin is "guarded instead (2FA, very few admins …)".
- ADR 0013: the account ends with the membership.

**Code**

- Setup is two steps: `OrganizationForm.tsx:56-91` creates from a name, then routes (`:86`); Connections, Members, Invite render only after (`:135-141`).
- `InviteMemberForm.tsx:19` offers `member|owner|admin`; Better Auth refuses `owner` from a non-owner (`crud-invites.mjs:123`).
- Members page `[organizationSlug]/settings/members/page.tsx:47` exists, gated `organization.manage`; nothing links to it.
- `OrganizationMembersList.tsx:171-178` offers "Leave" on your own row (ADR 0013: deletes the account). (inf.) It lists the platform admin's inert `owner` row; `api/office/agents/route.ts:25` filters it, this list does not.
- Invitee path: email (`packages/auth/auth.ts:339-361`) → `/signup?invitationId` (name, `SignupForm.tsx:146`) → accept/decline modal → `/onboarding` asks the name again (`(main)/layout.tsx:20`) → Inbox. Decline leaves an office-less account (inf.).
- Invitation: expires in 48 h (Better Auth's default); no locale stored; the email goes in the **inviter's** locale, and its EN copy says "organization". (inf.) The list cancels but has no resend.
- Role labels "Admin / Owner / Member" (`saas.json organizations.roles`) clash with CONTEXT ("avoid admin").
- Passkeys and 2FA on (`auth.ts:293,364`), optional for everyone, platform admin included. Sign-up closed (`packages/auth/config.ts:5`); only the platform admin creates offices (`auth.ts:314`).
- Admin → Users can impersonate anyone (`UserList.tsx:143-152`): the platform admin can open guests, against ADR 0015.
- The shell shows the Nhịp mark, not the office name (`NavBar.tsx:152`).
- Connections: Zalo works end to end; WhatsApp can't be connected yet (`OfficeConnections.tsx:28`, #87).
- First run: a manager's empty Inbox says "No conversations." (`ThreadList.tsx:85`). Home's "Connect your CRM" links nowhere (`Home.tsx:91-99`).
- #81, #82, #128 are open and untriaged.

## 2. What's undecided

Each decision, with what it depends on in brackets:

1. Who does what, at go-live and later.
2. The one-step form (#81) [1, 5].
3. The manager's people screen (#82) [1].
4. The roles a manager may grant [3].
5. The invite's language.
6. The invitee's path [5, 7].
7. 2FA and passkeys.
8. The manager's first run [3].
9. Impersonation [7].
10. Office branding.

## 3. UI/UX shape

- **Platform admin**: Admin → Offices: create, Connections (Zalo, WhatsApp, CRM), People (invite managers).
- **Manager**: Team (the kit's members page, refitted): invite, pending invitations, remove. First-run panel on Home.
- **Agent**: email → signup → onboarding (language, passkey) → Inbox.
- **Guest**: nothing; the first message arrives on a connected endpoint.

Rules from DESIGN.md:

- **Canvas And Panel**: each setup block is a panel.
- **Pill Acts**: Invite and Create are pills; roles and statuses are squared badges.
- **One Blue**: one primary per panel.
- **Red Means Broken**: red only for "Needs reconnect" and removal; a pending invitation is a neutral badge.
- Admin badge tones: connected is success, "none" is neutral.
- Empty states: one centred sentence, at most 22ch, with an optional outline button.
- "Don't show a zero for a number Nhịp doesn't have": keep the CRM hatch, but link it.
- Headline for onboarding titles; targets at least 44px.

Copy: plain and factual. "Office, manager, agent", never organization, admin, owner or member. VI: văn phòng, quản lý, nhân viên (inf.; native read, #78). Removal names its consequence: "Removing Lan ends her account. Her guests return to the pool."

States:

- Pending: "expires in 7 days", with Resend and Copy link (the fallback when the email lands in spam).
- Expired: a neutral badge and Resend.
- Email already in an office: "This email already works in another office."

**A. Admin, new office (one step)**

```
┌ New office ─────────────────────────────┐
│ Office name   [Saigon Prime Realty    ] │
│ First manager [lan@saigonprime.vn     ] │
│ Language      (•) Tiếng Việt ( ) English│
│                     (Create and invite) │
└─────────────────────────────────────────┘
→ office page:  ┌ Connections ┐ ┌ People ──────────────┐
                │ Zalo [None] │ │ Lan Manager [Invited]│
                │ (Connect)   │ │ (Invite)             │
                │ CRM  None ▾ │ └──────────────────────┘
                └─────────────┘
```

**B. Manager, Team (user menu → Team)**

```
┌ Invite ────────────────────────────────────────┐
│ [email          ] [Agent ▾] [Tiếng Việt ▾] (Invite)│
└────────────────────────────────────────────────┘
┌ People 3 · Invited 1 ──────────────────────────┐
│ LN Lan Nguyễn  [Manager] you                    │
│ MT Minh Trần   [Agent]                       ⋯  │
│    an@…        [Agent] [Invited · 6d]        ⋯  │
└────────────────────────────────────────────────┘
```

**C. Manager, first-run Home**

```
┌ Getting your office ready ────────────────┐
│ ✓ Zalo OA connected                        │
│ ○ Agents: 0 joined, 2 invited     (Team)   │
│ ○ CRM not connected · Nhịp connects it     │
│ ○ First guest: message your OA to test     │
└───────────────────────────────────────────┘
[funnel strip; CRM cells hatched]
```

The panel goes once a guest has arrived and an agent has joined.

## 4. Round 1

1. **One-step form (#81).** (a) Name and email; (b) plus the manager's language; (c) a wizard with pipes and CRM. **Rec b**: pipes need the owner present, so they can't sit in one submit; the language decides the email and the first screen.
2. **Manager's people screen (#82).** (a) "Team" in the user menu → the kit's members page; (b) a sidebar item; (c) only from Home. **Rec a**, plus a link from the first-run panel: inviting is rare, and the sidebar stays Home and Inbox.
3. **What a manager grants.** (a) Agents only; (b) agents and managers, never `owner`. **Rec b**: ADR 0015 allows several managers. Also hide Leave and the platform admin's row.
4. **Invite language.** (a) The inviter's locale, as today; (b) picked per invite, VI by default, stored on the invitation and copied to `user.locale` at signup. **Rec b**: agents work in Vietnamese; the platform admin works in English.
5. **The invitee's path.** (a) The kit's four screens; (b) signup auto-accepts, and onboarding becomes a language confirm and a passkey offer, with the name prefilled. **Rec b**: declining makes an office-less account (ADR 0013), and the name is asked twice.
6. **2FA and passkeys.** (a) Optional, as today; (b) the admin area refuses a platform admin without 2FA, and operators are offered a passkey; (c) managers need 2FA too. **Rec b**: ADR 0018 requires it, and a passkey is the fastest login on a phone.
7. **The manager's first run.** (a) Home as it is; (b) the read-only "Getting your office ready" panel. **Rec b**: otherwise the first manager lands on zeros with nothing to do.
8. **Impersonation.** (a) Keep it for support; (b) hide it for operators. **Rec b**: ADR 0015 says the platform admin never sees guests; support happens over a screen share.

## 5. Later rounds

- Invitation expiry, and who learns of it [Q4, Q5].
- Telling the manager that a removed agent's threads returned to the pool [Q3].
- The office name in the shell, then a subdomain per office.
- Managers connecting their own pipes, then self-serve sign-up: Q1's form becomes the sign-up, with seats from #93.
- WhatsApp connections (#87). The CRM follows #128's answer (#101 or #126).
- A practice office for training agents. The office time zone and market config (Peru).
- E2E "Onboarding" scenarios: one-step setup, a manager invites, the invitee's path, an admin without 2FA refused.

## 6. Go-live cut

| By 10-18                                                                                                  | Days      |
| --------------------------------------------------------------------------------------------------------- | --------- |
| #128 intake doc; the client's answers on #99                                                              | 0.25      |
| #81 one-step form and office page order                                                                   | 1         |
| #82 Team link, Manager/Agent labels, no owner/Leave/admin row, removal copy                               | 1.5       |
| Invitee path: auto-accept, onboarding, invite language, "office" copy, 7-day expiry, resend and copy link | 1.5       |
| 2FA required for the platform admin; impersonation hidden                                                 | 0.5       |
| **Total** (E2E red first, inside each)                                                                    | **≈4.75** |

| After go-live, unless there's time                            | Days  |
| ------------------------------------------------------------- | ----- |
| First-run Home panel; the manager's empty Inbox naming the OA | 1     |
| Office name in the shell                                      | 0.5   |
| Subdomains, manager-run connections, self-serve with billing  | weeks |

Risk: week 2 already holds #68, #96 and #94. If it's tight, cut back to #81, #82 and the invitee path, and Eyal invites the agents himself.

## Status (2026-10-04): paused by Eyal

Round 1 (Q1–Q8 above) was asked and is unanswered. Resume here. The recommendations stand, except Q7's sketch: it drops the CRM line, since Home already says "No CRM".

## Decided (Eyal, 2026-10-05), unblocking #82

- **Q2:** a "Team" item in the user menu opens the kit's members page. No sidebar item.
- **Q3:** managers grant **Agent or Manager**, never the kit's `owner`. The page uses Nhịp's words (Agent and Manager, not member, admin and owner), hides "Leave" (ADR 0013 would delete the account), and hides the platform admin's row.
- Q1 and Q4–Q8 stay paused.
