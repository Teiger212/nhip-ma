# Grill prep: the CRM experience across kinds (2026-10-04)

## 1. What exists

**Decided on paper**

- The ADR 0003 amendment of 2026-10-04 exists only on PR #127 (`docs/attio-adr`, open). Main says "Pending". It reads: "an office with no CRM has no connection, writes nothing, and shows no won or lost until #126"; Connections shows the seat count, "flags any new [stage]", and offers "Re-check setup".
- #59 assigns the thread header "In CRM: <lead>", plus "Not in CRM yet" for managers. #64 adds that "agents see nothing".
- #70: a manager links a thread by searching name or phone, 3+ characters, debounced. Agents see the status read-only.
- DESIGN.md: "Won and Lost … neutral badge"; Funnel Strip: "a 40px hatched box with a white 'Connect your CRM' chip".
- PRODUCT.md:154–156 sets the coming-soon rule: the only exception is the CRM selector (Bitrix24, Getfly, Zoho).

**Doc drift (amend these)**

- PRODUCT.md:105 says "Attio for the first client" and :202, :208 say the same, against round 4 ("first client's CRM is unknown").
- #59's last comment says the same.

**Code (main = this branch, no diff)**

- `OfficeCrm.tsx:90-93` and `api/crm/connection/route.ts:37` list every `CrmKind.options`. Mock is not hidden and there are no coming-soon entries. No failing state (#59 story 34 unmet); the token is saved unchecked (`route.ts:66-67`).
- `config.ts:61,65`: `VERCEL_ENV` exists (prod refuses `MOCK_CRM_WEBHOOK_SECRET`): the hide-mock signal; staging is Preview (inf.).
- `CrmStatus.tsx:15` and `store.ts:164` render only a complete link, as a neutral "In CRM: {name}" seen by everyone. Header order (`ThreadDetail.tsx:88-90`): pipe, owner, turn, CRM, owner control. No other CRM state exists.
- `ThreadParts.tsx:38-43`: neutral Won and Lost. vi: "Chốt" and "Mất".
- `Home.tsx:21,91-99`: Closings and Lost are always hatched with "Connect your CRM", connected or not. `Funnel` has no closings field. Every operator sees a call to action only the platform admin can act on.
- Schema: `CrmKind {mock, hubspot}`, no Attio setup data. Kit: `packages/notifications` and `NotificationCenter.tsx` (bell).

**Issues:** all open; #123, #101, #126 untriaged.

## 2. What's undecided

- No-CRM Home copy. Depends on the coming-soon rule and on whether #126 is confident.
- The thread-state vocabulary and who sees each state. Depends on #64's "agents see nothing".
- Where admin-only problems surface (owner missing, unmapped stage, failing). The platform admin never opens threads (ADR 0015).
- Where manual linking lives. Depends on header density.
- Selector shape: grouping, and Attio's label before #101 ships.
- The Attio setup surface, and when the office counts as "connected". Depends on owner being required.

## 3. UI/UX shape

| Surface             | Agent      | Manager | Platform admin  |
| ------------------- | ---------- | ------- | --------------- |
| Row/header Won·Lost | ✓          | ✓       | –               |
| "In CRM: name"      | ✓ own+pool | ✓       | –               |
| Not-in-CRM states   | –          | ✓       | via Connections |
| Link/unlink         | –          | ✓       | –               |
| Connections CRM     | –          | –       | ✓               |
| Home Closings/Lost  | ✓          | ✓       | –               |

The guest sees nothing.

**States**

- Selector: loading is a disabled trigger; a save error is a toast.
- Attio setup: Checking key, Setting up (four steps), Needs choices (stages, owner), Connected, and Problem (red, named, for example "Deals not enabled").
- Thread CRM: none, writing, linked, retrying, owner missing, ambiguous, deleted.
- Home: no CRM (hatched), connected with no outcomes (a real 0, honest once connected), and stale (the "as of" time).

**Rules that bind**

- The Turn Is The Signal: every CRM badge is neutral.
- Red Means Broken: red only on the admin's problem states.
- The Pill Acts: Re-check and Link are pills; steps are squared badges.
- Canvas And Panel: setup lives inside the Connections card. Settings use `grid-cols-setting`.
- Don't show a zero for a number Nhịp doesn't have.
- Floating layers only for the search popover.

**Copy:** plain facts; check en and vi lengths.

```
Connections ▸ CRM                              [ Attio            ▾ ]
┌ Attio ─────────────────────────────────────────────────────────┐
│ API key  [••••••••••]  (Save)   Key saved. Never shown again.  │
│ [✓ Key] [✓ Deals on] [✓ Attributes] [✓ Webhook]             │
│ Won stages    ☑ Won 🎉   ☐ In Progress                          │
│ Lost stages   ☑ Lost                                           │
│ Default owner [ Lan Tran ▾ ]                                   │
│ 2 of 5 agents have an Attio seat; the rest go to the default.  │
│ [1 new stage isn't mapped to won or lost]          (Re-check)  │
└────────────────────────────────────────────────────────────────┘

Thread header:  ‹ Minji Park  [Zalo][Pool][Your turn][In CRM: Minji Park]
Side detail (manager):
  CRM   Not linked: two leads match         (Link lead)
        ┌ popover ─────────────────┐
        │ [min        ]            │
        │ Minji Park · +82 10…     │
        └──────────────────────────┘

Home  4 Closings            5 Lost
      [//No CRM connected//] [//No CRM connected//]
      Closings and lost come from the office's CRM.
```

## 4. Round 1

1. **No-CRM Home cells.** Options: (a) keep "Connect your CRM"; (b) the chip says "No CRM connected" and the hint "Closings and lost come from the office's CRM, never the chat"; (c) hide the cells.
   **Rec: (b).** Agents can't act on "Connect", and naming #126 breaks the coming-soon rule. This edits DESIGN.md's Funnel Strip line.

2. **Thread CRM vocabulary.** Today "Not in CRM yet" (retrying) and "Not in CRM" (deleted) differ by one word, and in vi by less.
   **Rec:**
   - In CRM: name
   - Not in CRM yet
   - Not in CRM yet: owner missing
   - Two CRM matches: link one
   - Deleted in CRM

   Only "In CRM" is shown to agents; the rest are manager-only, all neutral. A manager can't fix owner missing, so red would be alarm without an action.

3. **Where admin-only problems surface.** Options: the Connections card only; card plus a badge in the Admin office list; card plus the kit's bell notification.
   **Rec: card plus office-list badge (error tone) plus kit notification for owner missing and failing.** Owner missing stops all writes, and the admin never sees threads.

4. **Manual link entry (#70).** Options: a pill in the header; a "CRM" section in the side detail with a search popover.
   **Rec: the side detail.** The header already wraps on a phone. The section can also hold the Won/Lost date and reason. Hint "Name or phone, 3+ characters": Attio search skips custom text, so Zalo ids aren't searchable.

5. **Selector shape (#123).** Options: flat with "(coming soon)"; grouped "Available" / "Coming soon" headings.
   **Rec: grouped.** Mock shows only when `VERCEL_ENV !== "production"`, enforced in GET and PUT. Attio is listed live only once #101 ships, until then under coming soon.

6. **When an Attio office is "connected".** Options: on key save; once the owner is picked; once owner and stages are confirmed.
   **Rec: once the owner is picked (stages pre-ticked by title).** Attio refuses an ownerless deal. Until then the badge reads "Needs setup" (neutral) and nothing is written.

7. **Setup surface.** Options: inline panel under the CRM row; sheet; its own admin page.
   **Rec: inline panel.** Canvas And Panel Rule. A sheet hides the other connections, and the steps double as the Re-check report.

## 5. Later rounds

- Re-check output: what was repaired; does it run itself after a stage notice?
- Ambiguous: pre-fill both candidates, or a blank search.
- Unlink: confirm or undo.
- The seat line at 0 seats.
- HubSpot failing state: validate the token at save, or report later.
- The Lost reason's language; #91.
- #126: does a built-in CRM add an agent-facing "mark won"? That collides with "Not a CRM".

## 6. Go-live cut (2026-10-18)

The cut branches on the #128 intake answer. All days are estimates (inf.).

**Ships regardless (about 1.5 days)**

- No-CRM Home copy, DESIGN.md, and the #68 "office with no CRM shows it" E2E: 0.5 day.
- Mock hidden in production (GET and PUT, E2E): 0.25 day.
- Fix the PRODUCT.md and #59 drift, and merge #127: 0.25 day.
- The #94 polish of the existing CRM surfaces: 0.5 day.

**If HubSpot (about 6 days):** the production OAuth app, since the static demo app can't install on a client portal (ADR 0003, inf.): 2 days. #64, #67, #68 with "as of", and #70: 1 day each. Failing state and notification: 0.5 day.

**If Attio (about 7–8 days)**

- #101: 3–4 days.
- The setup panel: 1 day.
- #64, #67, #68 and #70 as above: about 4 days, some shared.

**If None:** nothing more.

**After go-live:** #123 and #116 (demo-only, 0.5 day plus Eyal's steps), #126, #91.

## Status (2026-10-04): paused by Eyal

Not started. Resume from round 1 above. The PRODUCT.md grill (PR #130) already settled Home's no-CRM chip and the coming-soon entries in the admin selector.
