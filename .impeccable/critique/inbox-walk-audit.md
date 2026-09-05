# Inbox walk — Impeccable technical audit

**Target:** Nhịp inbox walk (`apps/saas` `InboxShell` + `Inbox`)
**Surfaces:** `apps/saas/modules/inbox/components/InboxShell.tsx`, `Inbox.tsx`, `InboxLocaleSwitch.tsx`
**Route:** `apps/saas/app/(inbox)/` → `/` on the walk app
**Mode:** Operate
**North star:** Inbox triage — pick a thread, read extract + crib, approve the first reply
**Kit:** `@repo/ui` + lucide-react. Not a brand lock. No `DESIGN.md` yet; do not invent one here.
**Method:** Code-level audit against `PRODUCT.md` and the incumbent walk. No UI redesign.

This is a technical quality check, not a visual critique. Findings stay inside the current walk: invented threads, mock send, kit chrome. Do not treat this document as a brief to rebuild the inbox.

---

## Audit Health Score

| #         | Dimension                | Score     | Key Finding                                                                                   |
| --------- | ------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| 1         | Accessibility            | 2         | Approve + send status is a mute `<span>`; Language and pipe/sent badges miss 44px touch       |
| 2         | Performance              | 3         | Client-only thread filter over the loaded list; no layout thrash, no image weight             |
| 3         | Theming                  | 3         | Kit tokens (`bg-background`, `text-foreground`, `bg-muted/30`, status badges) — no brand lock |
| 4         | Responsive Design        | 1         | Below `md`, shell nav is gone and list + detail stay a fixed `w-72` + remainder split         |
| 5         | Implementation Integrity | 3         | Operate walk is coherent; P1 layout/CTA gaps, no brand invention                              |
| **Total** |                          | **12/20** | **Acceptable**                                                                                |

**Rating band:** 10–13 Acceptable (significant work needed).

---

## Implementation Integrity Verdict

**Pass, with isolated Operate gaps.** The walk expresses Nhịp’s product-specific system: one inbox of invented guests, one-shot extract + “For you” crib above Reply, paperwork flag when mentioned, human approve, never auto-send, official-pipe copy in the footer. Disabled Reports / International stay placeholders. `@repo/ui` + lucide-react is the kit, not a second design system.

Verified in source:

- Human approve gate: `approveAndSend` refuses a second send with HTTP 409 `already_sent` (`apps/saas/modules/inbox/lib/inbox.ts` 70–76). UI disables the primary button when `selected.sentAt` is set (`Inbox.tsx` 350–353).
- Loading / load-error: empty list pane shows `inbox.loading` or `inbox.loadError` (`Inbox.tsx` 259–267).
- For you above Reply: crib card then reply card (`Inbox.tsx` 329–367).
- Paperwork: extract row + crib flag, no invented law (`Inbox.tsx` 85; `crib.ts` 14; `PRODUCT.md` principle 3).
- en / vi Language label: `inbox.language` → “Language” / “Ngôn ngữ”; switch writes `NEXT_LOCALE` (`InboxLocaleSwitch.tsx`; `packages/i18n/translations/{en,vi}/saas.json`).
- Agency footer: “Guests see the agency number. Never auto-send.” (`saas.json` `inbox.footer`; `InboxShell.tsx` 63; `Inbox.tsx` 374–376).
- Invented guests only: Minji, Yuki, Alexei, Thảo (`seed.ts` 14–40). Not real guests. Not Hạnh.

This is not a brand lock. Working name “Nhịp” is a sidebar string. Colors and type come from the kit. Do not treat the walk as a visual system to extend.

---

## Executive Summary

- Audit Health Score: **12/20** (Acceptable)
- Issues: **0 P0 / 3 P1 / 5 P2 / 4 P3**
- Top issues: no list/detail below `md`; Approve and send buried below the fold; small touch targets on badges and Language
- Recommended next steps: sticky approve bar + mobile list/detail. Later: `/impeccable document` for `DESIGN.md`, `/impeccable clarify` for timestamps. Out of scope: live pipes, brand lock, enabling Reports / International.

---

## Detailed Findings by Severity

### P1 — Major (fix before a walk you would put in front of an agency)

#### [P1] No list/detail below `md`

- **Location:** `InboxShell.tsx` 15 (`aside` `w-56 md:flex hidden`); `Inbox.tsx` 256–307 (`aside` `w-72` always on)
- **Category:** Responsive
- **Impact:** Below the `md` breakpoint the shell nav, brand, and Language control disappear (`hidden` until `md:flex`). The thread list stays a fixed 18rem column beside the detail pane. On a phone the operator cannot stack list → thread. Triage — the north-star task — is a squeezed two-pane desktop layout.
- **WCAG/Standard:** WCAG 2.2 1.4.10 Reflow (content should reflow to a single column at 320 CSS px without two-dimensional scrolling)
- **Recommendation:** Below `md`, show either the thread list or the selected thread (back control to return to the list). Keep `InboxShell` chrome reachable on small viewports (sheet, top bar, or the existing mobile footer — do not leave Language only in a hidden `w-56` rail). Do not invent a new IA.
- **Suggested command:** `/impeccable adapt`

#### [P1] Approve CTA buried — sticky bar fix

- **Location:** `Inbox.tsx` 308–367. Primary `Approve and send` sits at the bottom of `article` → `overflow-y-auto` after messages, nine-row extract, For you, and the reply textarea (`349–357`).
- **Category:** Responsive / Implementation Integrity
- **Impact:** Operate mode. The one action that transmits is below the fold on every thread with more than a couple of inbound lines. The operator already decided to approve; they should not hunt for the button. `disabled={Boolean(selected.sentAt) || approving}` is correct; placement is not.
- **WCAG/Standard:** WCAG 2.2 2.4.11 Focus Not Obscured (once sticky); Fitts’s law / thumb-zone for Operate
- **Recommendation:** Pin Approve and send (and the send status) in a sticky bar on the detail pane. Leave Reply editable above it. Do not add a second send path.
- **Suggested command:** `/impeccable layout`

#### [P1] Small touch targets on badges and Language

- **Location:**
  - Pipe / sent badges: `Inbox.tsx` 292–301, 317–322 (`Badge` default `text-xs py-1`; mock chip `h-4` at 128)
  - Language: `InboxLocaleSwitch.tsx` 32 (`className="h-8 px-2"`); kit `Button` `sm` is `h-6`, `icon` is `size-8` (`packages/ui/components/button.tsx` 25–28)
  - Shell nav rows: `InboxShell.tsx` 22–56 (`h-8` ghost buttons)
- **Category:** Accessibility / Responsive
- **Impact:** Status chips and Language sit under the 44×44 px target. On a phone the operator mis-taps pipe vs sent, or misses Language in the `w-56` footer / `md:hidden` bar.
- **WCAG/Standard:** WCAG 2.2 2.5.5 Target Size (AAA 44×44); 2.5.8 Target Size Minimum (AA 24×24 — badges can still fail when stacked)
- **Recommendation:** Keep badges as status, not implied controls. Enlarge the Language trigger to ≥44px. If list badges stay tappable-adjacent, add spacing or stop nesting them as the only hit-area chrome on the row (the row `Button` is already the control).
- **Suggested command:** `/impeccable harden`

---

### P2 — Minor (next pass)

#### [P2] Raw ISO timestamps

- **Location:** `Inbox.tsx` 125 (`{message.source} · {message.at}`); `Inbox.tsx` 200 (`t("alreadySent", { at: selected.sentAt })` → `already sent {at}`); store maps `at` with `toISOString()` (`packages/database/inbox/store.ts` 121)
- **Category:** Implementation Integrity
- **Impact:** Operators see `2026-09-05T07:20:00.000Z` (or similar) in the thread and in the already-sent line. Workable, not scannable. Agency desk copy should be a localized relative or local datetime — later, via clarify, not a new time model.
- **WCAG/Standard:** WCAG 2.2 3.1.5 (reading level) — ISO-8601 is machine form
- **Recommendation:** Format `message.at` and `sentAt` for the active `en` / `vi` locale. Keep the stored ISO. Do not invent timezone policy in this audit.
- **Suggested command:** `/impeccable clarify`

#### [P2] Nine-row qualification with missing noise

- **Location:** `Inbox.tsx` `ExtractFields` 76–86 — always nine rows: language, area, nationality, in Việt Nam now, rent or buy, move-in, budget, beds / household, paperwork
- **Category:** Implementation Integrity
- **Impact:** Empty extract cells render `inbox.missing` (“(missing)”) in muted text. That matches the product rule (missing stays missing). On a thin extract it is still nine rows of noise before For you and Approve. The crib already compresses facts (`formatCribNotes` skips unset fields).
- **Recommendation:** Keep the nine fields as the model. In the walk UI, de-emphasize or collapse rows whose value is `missing` / `none mentioned` so the operator sees filled facts first. Do not drop the paperwork row when mentioned.
- **Suggested command:** `/impeccable distill`

#### [P2] Send status is not `aria-live`

- **Location:** `Inbox.tsx` 358–364 — status is a `<span>` with color only (`text-destructive` vs `text-muted-foreground`). States: `sending…`, `not sent`, `already sent {at}`, 409 / error message.
- **Category:** Accessibility
- **Impact:** Keyboard and screen-reader users who activate Approve and send get no polite live announcement. Sighted users see the string next to the button. Loading the list is visible text; approve result is not announced.
- **WCAG/Standard:** WCAG 2.2 4.1.3 Status Messages
- **Recommendation:** Put the status node on `role="status"` / `aria-live="polite"` (and `aria-atomic="true"`). Do not move the only feedback into a toast that can be missed.
- **Suggested command:** `/impeccable harden`

#### [P2] Empty For you card

- **Location:** `Inbox.tsx` 235–244, 329–337. `cribNotes` is `selected?.oneShot && formatCribNotes(...)`. Card always mounts; body is `{cribNotes || ""}`.
- **Category:** Implementation Integrity
- **Impact:** If `oneShot` is absent, For you still paints title + “Not sent to the guest.” over a blank body. When extract is empty but `oneShot` exists, `crib.emptyFacts` (“nothing extractable yet”) fills the template — that path is fine. The blank card is the hole.
- **Recommendation:** If there is no one-shot, omit the card or show the empty-facts crib string. Do not add onboarding theater.
- **Suggested command:** `/impeccable onboard`

#### [P2] Footer clipping in `w-56`

- **Location:** `InboxShell.tsx` 15 (`w-56`), 59–64 (`px-3 py-2 text-xs` footer + Language in `p-2`)
- **Category:** Responsive / Theming
- **Impact:** 14rem rail, `px-3`, `text-xs`: “Guests see the agency number. Never auto-send.” wraps or clips against the Language row. The never-auto-send constraint is easy to lose at the desktop breakpoint the shell actually uses.
- **Recommendation:** Let the footer wrap on two lines, or shorten the string without dropping “Never auto-send.” Do not widen into a brand sidebar.
- **Suggested command:** `/impeccable layout`

---

### P3 — Polish (if time)

#### [P3] Inter latin vs JP / KO / RU

- **Location:** `apps/saas/app/layout.tsx` 15–17 — `Inter({ subsets: ["latin", "vietnamese"] })`; `apps/saas/app/globals.css` `--font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif`
- **Category:** Theming / Implementation Integrity
- **Impact:** Walk threads include Korean (Minji), Japanese (Yuki), and Russian (Alexei) inbound (`seed.ts` 16–33). UI chrome is en/vi. Guest glyphs fall through to `ui-sans-serif` / system. Acceptable for a kit walk; not a reason to lock a multi-script brand font.
- **Recommendation:** If the walk must render JP/KO/RU inbound crisply, add the matching Inter (or kit) subsets or a system-ui stack that covers Hangul, kana, and Cyrillic. Do not introduce a display face.
- **Suggested command:** `/impeccable typeset`

#### [P3] Client-only search

- **Location:** `Inbox.tsx` 150–153, 248–254; `apps/saas/modules/inbox/lib/search.ts` — `matchesThreadSearch` filters the already-fetched list by guest name / last inbound
- **Category:** Performance
- **Impact:** Fine for four invented threads. Every keystroke refilters on the client. Not a live-pipe search, not a server query. Do not build a search product here.
- **Recommendation:** Leave as-is until list size or live ingest makes it slow. Then debounce or move the filter with the list endpoint — still name/last-inbound only.
- **Suggested command:** `/impeccable optimize`

#### [P3] No Playwright inbox e2e

- **Location:** `apps/saas/tests/login.spec.ts` only. `apps/saas/playwright.config.ts` `testDir: "./tests"`. No `*inbox*` spec.
- **Category:** Implementation Integrity
- **Impact:** Unit coverage exists (`approve.test.ts` 409, `crib.test.ts`, `search.test.ts`, `seed.test.ts`). The walk UI — list, approve, 409 already-sent, en/vi — has no Playwright path. A layout regression (this audit’s P1s) would not fail CI.
- **Recommendation:** When adding e2e, cover: list loads invented guests, select thread, Approve and send, second approve stays sent / 409, Language en↔vi. Not in this docs commit.
- **Suggested command:** `/impeccable harden`

#### [P3] No GitHub Actions

- **Location:** no `.github/workflows/` in the repo
- **Category:** Implementation Integrity
- **Impact:** Lint, type-check, Vitest, and Playwright are local/manual. The walk can drift without a gate. Out of band for UI.
- **Recommendation:** Add a workflow later; do not block the walk on CI invention in this audit.
- **Suggested command:** `/impeccable harden`

---

## Patterns & Systemic Issues

1. **Desktop-first Operate chrome.** `InboxShell` is `md:flex hidden`; `Inbox` list is a permanent `w-72`. There is no small-viewport list/detail pattern. Responsive score 1 is this pattern, not scattered one-off widths.
2. **Primary action is at the end of the reading column.** Extract (nine rows) + For you + Reply + Approve is a single scroll. The north-star action loses to inventory.
3. **Kit density under 44px.** `h-8` Language, `h-8` nav, `text-xs` badges, `h-4` mock chip. Consistent with compact kit admin, not with a thumb-operated desk.
4. **Machine strings in the thread.** ISO `at` / `sentAt` next to human crib and agency footer. Same “show the stored value” habit as `(missing)` on every empty extract row.

No hard-coded brand palette. No second component library. No detector claim that the walk is an unrelated dashboard with a label swap — guest names, pipes, paperwork, and never-auto-send are specific.

---

## Positive Findings

- **Human approve, never auto-send.** Approve and send is explicit; `sentAt` disables a second click; server returns 409 `already_sent` (`inbox.ts` 70–76; `approve.test.ts` 127–128).
- **Load states.** List pane distinguishes loading, load error, empty store, and no search matches (`Inbox.tsx` 259–267) with en/vi strings.
- **For you is crib, not guest copy.** Card sits above Reply; hint is “Not sent to the guest.” Paperwork flag does not invent Vietnamese law.
- **Language is labeled.** Kit `LocaleSwitch` uses `inbox.language` (“Language” / “Ngôn ngữ”), not an icon-only control. Walk locales are `en` and `vi` only (`InboxLocaleSwitch.tsx` 9–18).
- **Agency footer.** Guest still sees the agency number; never auto-send. Matches `PRODUCT.md` positioning.
- **Invented guests only.** Seed comment and `DEMO_THREADS` (Minji, Yuki, Alexei, Thảo). Search is “not a new entity.”
- **Theming uses tokens.** `bg-background`, `text-foreground`, `border-border`, `bg-muted/30`, badge `status` tokens. ThemeProvider stays on. No locked Nhịp palette.
- **Reports / International stay disabled.** Correct for this walk (`InboxShell.tsx` 35–56). Do not enable them from this audit.

---

## Out of scope

Do not take this audit as a request to:

- Stand up live Zalo / WhatsApp pipes, webhooks, or real send
- Lock a brand system, color palette, or output template
- Enable Reports or International
- Rebuild a two-desk / stay-band / foreign-buyer cockpit
- Replace `@repo/ui` or add a parallel design system

---

## Recommended Actions

No P0. Order is P1 → P2 → documented follow-ups. Commands only; no redesign brief.

1. **[P1] `/impeccable adapt`:** Mobile list/detail — below `md`, one pane at a time; restore Language when the `w-56` rail is hidden.
2. **[P1] `/impeccable layout`:** Sticky Approve and send + status on the detail pane; fix `w-56` footer wrap.
3. **[P1] `/impeccable harden`:** Language (and adjacent controls) ≥44px; `aria-live` on send status.
4. **[P2] `/impeccable distill`:** Cut missing-row noise in the nine-field extract without dropping the model.
5. **[P2] `/impeccable onboard`:** Don’t ship a blank For you card when `oneShot` is missing.
6. **[P2] `/impeccable clarify`:** Human timestamps for `message.at` / `sentAt` (follow-up; keep ISO in storage).
7. **Later `/impeccable document`:** Write `DESIGN.md` from the kit + walk once P1 layout is settled — not a brand lock.
8. **`/impeccable polish`:** Final Operate pass after adapt + sticky approve.

Suggested implementation follow-ups (same findings, no extra scope): sticky approve + mobile list/detail first; `DESIGN.md` later; clarify timestamps when copy is in play.

---

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.
