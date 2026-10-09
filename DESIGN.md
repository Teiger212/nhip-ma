---
name: Nhịp
description: A speed-to-lead inbox for Vietnamese apartment agencies. Flat, blue, and built to show whose turn it is.
colors:
  background: "#ffffff"
  harbor-ink: "#0f172a"
  slate-note: "#475569"
  morning-wash: "#f1f5fd"
  deep-navy: "#1e3a8a"
  hairline-blue: "#e4ecfc"
  field-edge: "#cbd9f5"
  desk-canvas: "#f2f5fb"
  dispatch-blue: "#2563eb"
  touch-blue: "#1d4ed8"
  chart-strong: "#2563eb"
  chart-soft: "#9db9f2"
  chart-track: "#eef3fd"
  hatch: "#cbd9f5"
  signal-red: "#dc2626"
  sent-green: "#166534"
  your-turn-amber: "#92400e"
  night-canvas: "#080e1a"
  night-desk: "#0b1220"
  night-card: "#111a2e"
  night-wash: "#1b2740"
  night-hairline: "#253352"
  night-field-edge: "#34456b"
  night-ink: "#e2e8f0"
  night-note: "#94a3b8"
  night-blue: "#3b82f6"
  night-touch: "#60a5fa"
  night-chart-soft: "#2f4f8a"
  night-chart-track: "#17223a"
  night-hatch: "#2a3a5e"
typography:
  headline:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
  page-title:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1
  thread-name:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "2.5rem"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: '"tnum"'
  figure-small:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "2rem"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: '"tnum"'
  body:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  body-small:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.375
  label:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
  micro-caps:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    letterSpacing: "0.025em"
  clock:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    fontFeature: '"tnum"'
  count:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
    fontFeature: '"tnum"'
rounded:
  sm: "3.6px"
  md: "4.8px"
  lg: "6px"
  xl: "8.4px"
  2xl: "10.8px"
  3xl: "13.2px"
  4xl: "15.6px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.dispatch-blue}"
    textColor: "{colors.background}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #2563eb 82%, #ffffff)"
  button-secondary:
    backgroundColor: "{colors.morning-wash}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.background}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.xl}"
    padding: "4px 12px"
    height: "36px"
  input-search:
    backgroundColor: "{colors.morning-wash}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px 12px 48px"
    height: "48px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.3xl}"
    padding: "24px"
  panel:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.3xl}"
    padding: "20px"
  page-canvas:
    backgroundColor: "{colors.desk-canvas}"
    textColor: "{colors.harbor-ink}"
  thread-row:
    backgroundColor: "transparent"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
  thread-row-active:
    backgroundColor: "{colors.hairline-blue}"
    rounded: "{rounded.xl}"
  guest-mark:
    backgroundColor: "color-mix(in srgb, #1d4ed8 12%, transparent)"
    textColor: "{colors.touch-blue}"
    rounded: "{rounded.md}"
    size: "32px"
  guest-mark-selected:
    backgroundColor: "{colors.dispatch-blue}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    size: "32px"
  flag-your-turn:
    backgroundColor: "color-mix(in srgb, #92400e 12%, transparent)"
    textColor: "{colors.your-turn-amber}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  flag-count:
    backgroundColor: "color-mix(in srgb, #92400e 12%, transparent)"
    textColor: "{colors.your-turn-amber}"
    typography: "{typography.count}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  flag-sent:
    backgroundColor: "color-mix(in srgb, #166534 12%, transparent)"
    textColor: "{colors.sent-green}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  flag-pipe:
    backgroundColor: "{colors.morning-wash}"
    textColor: "{colors.slate-note}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  message-inbound:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
  message-outbound:
    backgroundColor: "color-mix(in srgb, #f1f5fd 60%, transparent)"
    textColor: "{colors.harbor-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
  operator-note:
    backgroundColor: "color-mix(in srgb, #1d4ed8 8%, transparent)"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.xl}"
    padding: "12px"
  nav-item-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.md}"
  flag-error:
    backgroundColor: "color-mix(in srgb, #dc2626 12%, transparent)"
    textColor: "{colors.signal-red}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  flag-info:
    backgroundColor: "color-mix(in srgb, #2563eb 12%, transparent)"
    textColor: "{colors.dispatch-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  view-tab-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.full}"
    height: "32px"
    padding: "0 12px"
  figure-missing:
    backgroundColor: "transparent"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 12px"
---

# Design System: Nhịp

## Overview

**Creative North Star: "The Dispatch Desk"**

Nhịp is the desk where every new lead lands and someone answers it before it goes cold. The screen has one job: show which guest is waiting, whose turn it is, and put the reply one tap away. Everything else stays quiet. The app sits on a pale blue canvas (deep night blue in dark mode); content sits on white panels with hairline blue edges, and one saturated blue marks every action and the thread you're looking at. The only other color is the turn itself: amber for _your turn_, green for _sent_. Red is kept for things that broke.

The desk is dense but calm. Agents work it on a phone and at a desk about equally, so the thread list and the thread are the same product in both places: one full-bleed column on a phone, two panels side by side from `md` up. Below `lg` (1024px) the app runs its phone shell: a 56px top bar with the sidebar as a sheet behind it. Density comes from tight rows and small, exact type, not from shrinking touch targets. Every control someone taps mid-conversation is at least 44px tall. Home is the numbers screen: light mono figures, one blue at two strengths, and an honest hatch where a number doesn't exist yet.

The system comes from a supastarter kit, refit for triage. Pills are for acting, gently squared corners are for content, and depth comes from tone. Only floating layers (menus, dialogs, toasts) cast a shadow. Headings are in Be Vietnam Pro and body text in Noto Sans. Both carry the Vietnamese subset, so diacritics set cleanly at every size.

**Key Characteristics:**

- One action blue; the turn (amber / green) is the only other signal on a row.
- Canvas and panels: a pale canvas carries borderless navigation; content lives on white, hairline-edged panels.
- Flat surfaces: tonal fills and 1px inset hairlines instead of shadows. Floating layers are the one exception.
- Pill buttons, squared content (rows, badges, messages, fields).
- Selection is a fill, never a side stripe: an accent row with a solid guest mark, a white chip in the nav.
- Digit-only content in IBM Plex Mono with tabular figures (counts, Home's light figures); timestamps in the sans, tabular.
- Light and dark themes are both first-class; every token has a night twin.

## Colors

Cool, low-chroma slate and blue neutrals carrying a single saturated blue, with amber, green and red reserved for state.

### Primary

- **Dispatch Blue** (#2563eb; night #3b82f6): the one action color. Primary buttons, links, the focus ring, the active nav icon, the selected guest mark, the info badge. When something on screen is blue and solid, you can press it or you're looking at it.
- **Touch Blue** (#1d4ed8; night #60a5fa): the guest mark's initials on their 12% tint, and the operator note's 8% tint (`--touch`). A step darker than Dispatch Blue in light mode so the initials hold 4.5:1 on their own tint; lifted in dark mode so tints still read on night surfaces.

### Neutral

- **Desk Canvas** (#f2f5fb; night #080e1a): the app's ground and the sidebar, which is the same surface. Panels sit on it.
- **Plain White** (#ffffff): panels, cards, and the active nav chip in light mode.
- **Harbor Ink** (#0f172a): body text and headings. Deep slate, not black.
- **Slate Note** (#475569): secondary text, such as previews, metadata, hints, empty-state sentences and the send-status line.
- **Morning Wash** (#f1f5fd): the secondary button fill, muted surfaces, the search field, the pipe badge, the reply box and details strip tint, outbound messages.
- **Deep Navy** (#1e3a8a): text on Morning Wash (secondary buttons).
- **Hairline Blue** (#e4ecfc): every border and divider, and the accent fill for the active thread row and hovered menu items. Borders are blue-tinted, never grey.
- **Field Edge** (#cbd9f5; night #34456b): input strokes, one step stronger than Hairline Blue so fields read as fields.
- **Night Desk / Night Card / Night Wash / Night Hairline** (#0b1220 / #111a2e / #1b2740 / #253352): the dark-mode background, panel, muted and border steps. **Night Ink** (#e2e8f0) and **Night Note** (#94a3b8) are its text colors.

### Chart

- **Chart Strong** (#2563eb; night #60a5fa): the one bar or share to read first: today's leads, the fastest response bucket, the funnel's share bars.
- **Chart Soft** (#9db9f2; night #2f4f8a): every other bar.
- **Chart Track** (#eef3fd; night #17223a): the empty part of a share bar and the chart's hover cursor.
- **Hatch** (#cbd9f5; night #2a3a5e): the diagonal hatch line for a number Nhịp does not have yet.

### State

- **Your-Turn Amber** (#92400e; night #fbbf24): the guest wrote last and nobody has answered. As a 12% tint with amber text on badges and counts (the row badge, the nav count, Waiting now's count); as bare amber text only for the wait time beside a waiting guest. Dark enough in light mode for 4.5:1 on its own tint, including on the selected row's fill.
- **Sent Green** (#166534; night #4ade80): our reply went out. The same 12% tint treatment, at the same 4.5:1.
- **Signal Red** (#dc2626; night #f87171): errors, failed sends, disconnected pipes, destructive actions. Nothing else.

### Named Rules

**The One Blue Rule.** Blue is the only action color. No second accent, no gradient, no brand purple. If a new control needs emphasis, it's primary blue or it's neutral.

**The Turn Is The Signal Rule.** On a thread, only the turn gets color: amber while the guest waits, green once we've answered. Pipe, owner and other metadata stay neutral grey-blue so the turn is readable from across the room.

**The Red Means Broken Rule.** Signal Red is for errors and destructive actions only. A waiting guest is amber, never red. Urgency is not an error.

**The Two Strengths Rule.** A chart is one blue at two strengths on a track: strong for the one value to read first, soft for the rest. No second hue, no legend colors.

## Typography

**Heading Font:** Be Vietnam Pro (with ui-sans-serif, system-ui)
**Body Font:** Noto Sans (with ui-sans-serif, system-ui)
**Mono Font:** IBM Plex Mono, 300 / 400 / 500 (with ui-monospace)

**Character:** A Vietnamese-designed geometric sans for names and headings, paired with a neutral humanist workhorse for messages, and a light mono for the numbers. All three draw full Vietnamese diacritics. `h1` to `h3` and `.font-heading` switch to Be Vietnam Pro automatically.

### Hierarchy

- **Headline** (700, 1.25rem on a phone, 1.5rem from `md`): auth and onboarding screen titles.
- **Page Title** (Be Vietnam Pro 600, 1.25rem on a phone, 1.5rem from `md`, −0.025em, balanced): the page header on Home, Settings and Admin, with a Slate Note subtitle (0.875rem) under it and an optional qualifier aside on the right.
- **Title** (600, 1.125rem, line-height 1): card titles (`CardTitle`) and section headers. Home's panel titles are the same face at 0.875rem on a phone, 1rem from `md`.
- **Thread Name** (Be Vietnam Pro 600, 0.875rem, −0.025em): the guest's name on a row, in the thread header and in Waiting now.
- **Figure** (Plex Mono 300, 2rem on a phone, 2.5rem from `md`, line-height 1, −0.03em, tabular): Home's headline numbers. Units beside a figure (`m`, `h`, words) drop to Noto Sans 0.875rem in Slate Note.
- **Body** (400, 0.875rem, 1.625): message text, with `pre-wrap` so guests' line breaks survive.
- **Body Small** (400, 0.75rem, 1.375): row previews (clamped to 2 lines), message meta, hints, stage labels.
- **Label** (500, 0.6875rem, `text-micro`): badges, avatar initials.
- **Count** (Plex Mono 500, 0.6875rem, tabular): a numeric badge (`Badge numeric`), such as the nav's Your-turn count and Waiting now's count.
- **Micro Caps** (500, 0.625rem, `text-2xs`, +0.025em, uppercase): the translation label under a message. The inline mock badge (`Badge size="sm"`) uses the same size in sentence case.
- **Clock** (Noto Sans, 0.6875rem on a row, 0.75rem in a message's meta line, tabular figures): every relative or absolute time, so times line up down the list. One format everywhere (#94): relative within a week ("6 hours ago"), then the date and time on the locale's own clock (12-hour in English, 24-hour in Vietnamese), the year only when it isn't this year's ("Sep 21, 5:11 PM", "17:11 21 thg 9"), Home's "As of" included. A duration (a wait, the median, the p90) is the two largest whole units that apply, never a decimal: "12 min", "3 h 20 min", "1 d 16 h" ("1 ngày 16 giờ").

### Named Rules

**The Tabular Clock Rule.** Times are Noto Sans with `tabular-nums`. A time mixes digits with words and separators (`5 phút`, `09:42`, a date), so it takes the sans; tabular figures keep a column of times from jittering.

**The Digits In Mono Rule.** Plex Mono carries digit-only content: Home's figures, numeric badges, funnel stage numbers, view-tab counts, bucket counts and shares. Words and units beside them stay in Noto Sans. Anything written as a phrase (a timestamp, a wait time, the p90 line) stays in the sans with tabular figures.

**The Theme Sizes Rule.** Sizes below 0.75rem and the figure sizes use theme tokens (`text-micro`, `text-2xs`, `text-figure`, `text-figure-sm`), never arbitrary values. `cn()` knows these tokens, so they survive a text color merged after them.

## Layout

The app is a canvas with panels on it. The sidebar is the canvas itself, with no border; the page area is the canvas too, and every block of content is a panel. There's no separate mobile design, only the same components on a narrower desk. Below `lg` (1024px) the shell is the phone one: a 56px top bar (menu, mark, bell, user menu) and the sidebar as a sheet. From `lg` the sidebar docks.

**Inbox.** From `md` up, the thread list (`--container-inbox-list`, 22rem) and the thread are two panels with a 10px gap, inset 12px from the canvas; from `lg`, where the sidebar docks beside them, the left gutter tightens to 4px. Search, the owner filter and the view tabs live inside the list panel. A manager's owner filter sits above search in every view but Unassigned, where it could only narrow the list to nothing: there a quiet Body Small note in Slate Note ("New leads wait here until you assign them.") holds its 44px row instead, so the tabs never move between views (#94). Below `md` the panels go full-bleed on white with no border, and swap: the list, then a thread with a back action. Rows are inset from the panel edge by 6px on each side (`w-row-inset`) with 2px of vertical gap, pad 10px × 12px, and keep a 10px gap between avatar and text. Empty states are one centred sentence capped at 22ch (`--container-empty-note`), with an optional outline button under it.

**The open thread (#248).** The thread panel is a workbench: the header, then the conversation with the reply box docked at its foot, always in view, and the guest's details in a 22rem rail on the right, split from the conversation by a hairline. Whether the rail fits is decided on the thread panel's own width, never the window's, so the sidebar counts: from 56rem (896px) of panel the rail shows; narrower, it folds into a strip under the header (the details as label and value pairs along a line, wrapping), and the CRM status and the manager's Assign to move into the header. On a phone (below `md`) the header is one line, the back arrow (icon only, 44px), the guest and the turn badge; the pipe, the owner, the CRM status and the manager's Assign to open the strip instead (#94). At 1563px with the sidebar open, and at 1366px with it collapsed, the panel keeps the rail; at 1366px with the sidebar open, and on a phone, it gets the strip. The conversation opens scrolled to the latest message, and follows new messages in while the operator is at (or within 80px of) the latest. Scrolled up to read older messages, it stays put when the guest writes, and a "New message" pill (a small primary Button with a down arrow, floating 12px above the reply box with the overlay `shadow-md`, as a floating layer may) takes them down to it; it goes when they reach the latest, by the pill or by scrolling. Their own send always goes to the latest.

**Home.** A `max-w-6xl` column under the page header. Panels stack with a 10px gap (12px from `md`): the funnel strip, one row of five cells from `lg`; then Leads by day (two thirds) beside Waiting now (one third) from `lg`; then Response time (median on a third, buckets on two thirds, from `md`). Below `lg` Waiting now comes above the chart, and the funnel's cells become Leads in across the top with the other four two by two. Grid children carry `min-w-0` so a long guest name truncates instead of widening the grid. Panel content pads 16px (20px from `md`).

Tap targets that matter mid-conversation (Send, Retry, Regenerate, View sent, the Quiet disclosure, Open inbox) are at least 44px tall (`min-h-11`), even where the button's visual height is smaller. On a phone the top bar's menu, bell (`size-11`) and user-menu trigger are 44px, the view tabs are 44px below `md`, and nav links are 44px below `lg`. Settings use a label/control grid: a third of the width for the label, capped at 360px (`grid-cols-setting`). Extracted fields use a `minmax(7rem, auto) 1fr` label/value grid (`grid-cols-fields`); response-time buckets use label, bar, count (`grid-cols-bucket`). Spacing is Tailwind's 4px step. The inbox lives on 6, 8, 10 and 12px.

### Named Rules

**The Canvas And Panel Rule.** The canvas carries navigation, page headers and status banners; panels carry content. A new block of content is a panel on the canvas, not a section drawn on the canvas, and the sidebar never gets its own edge.

## Elevation & Depth

Nhịp is flat. Depth comes from tone: the canvas under everything, white panels on it, Morning Wash for muted strips such as the docked reply box and outbound messages, Hairline Blue for selection. Inputs keep the kit's `shadow-xs` hairline. Surfaces have no drop shadows, and nothing has blur or glass. The one named surface shadow is really a line, drawn inside the box so it never shifts layout. Floating layers are the exception (see below).

### Shadow Vocabulary

- **Hairline** (`shadow-hairline`, `inset 0 0 0 1px var(--border)`): a 1px border drawn inside, for a white element sitting on a tinted surface: the active nav chip, the active view tab, inbound messages, the window chip, the hatched box.
- **Overlay** (the kit's soft drop shadows, in `packages/ui`): `shadow-md` on tooltips, popovers and select lists; `shadow-lg` on menus, dialogs, alert dialogs, sheets and toasts (menus tinted `black/3`, toasts `black/5`); `shadow-xl` on submenus. Each also carries a 1px border, which is what separates it in dark mode, where a black shadow vanishes.

### Named Rules

**The Flat Desk Rule.** Surfaces are flat at rest and flat on hover. State shows as a tonal fill, a solid guest mark, or a white chip on the canvas, never as lift. The single exception: floating layers lift; surfaces never do. Menus, popovers, selects, tooltips, dialogs, sheets and toasts keep the kit's soft drop shadow, with the hairline border as their separator in dark mode.

**The No Stripe Rule.** Nothing is marked by a colored side border. Selection, direction and notes read from fill and tint; the 2px rail is retired.

## Shapes

One base radius (6px, `--radius: 0.375rem`) scaled by fixed factors: sm 3.6px, md 4.8px, lg 6px, xl 8.4px, 2xl 10.8px, 3xl 13.2px, 4xl 15.6px. Actions are pills (`rounded-full`). Panels and cards use 3xl (13.2px) so they read as containers. Things inside a panel use xl (8.4px): thread rows, Waiting now rows, messages, the operator note, inputs. Small marks use md (4.8px): badges, the guest mark, the search field, chips. The hatched box uses lg (6px).

**The Pill Acts Rule.** If it's fully round, it does something. Status and metadata are never pills; they're small squared badges. (Share bars are round-ended lines, not controls, and the view tabs are a pill toggle because they act.)

## Components

### Buttons

Confident, compact pills that press in slightly.

- **Shape:** full pill (9999px) at every size: sm 24px, md 36px (default), lg 48px, icon 32px square-round.
- **Primary:** Dispatch Blue fill, white text, 16px horizontal padding, semibold 0.875rem. Hover mixes the blue 82% toward the background.
- **Secondary (default variant):** Morning Wash fill, Deep Navy text; hover darkens it 10%.
- **Outline:** a 10% ink border on transparent; hover adds a 10% ink wash. It's the choice for the secondary action in an empty or error state, and for Waiting now's full-width Open inbox.
- **Ghost:** no fill until hover (10% ink wash). Thread rows are not Buttons; they are their own row element (see Thread Row).
- **Destructive:** Signal Red fill; only for the irreversible.
- **Focus:** 2px Dispatch Blue ring, offset 2px from the background.
- **Active:** scales to 0.98 over 200ms ease-out. Motion stops under `prefers-reduced-motion`.
- **Loading:** a spinner before the label; the button keeps its width.

### Badges (the turn, the pipe, the owner, the count)

- **One component:** `Badge` (`packages/ui/components/badge.tsx`) is the only status mark, in the inbox, on Home and in Admin. 20px tall (`h-5`), 8px horizontal padding, 4.8px radius (`rounded-md`), Label type (500, `text-micro`), no border.
- **Tones:** each is its color as text on a 12% tint of itself. Neutral (default) is Slate Note on Morning Wash; info is Dispatch Blue; success is Sent Green; warning is Your-Turn Amber; error is Signal Red.
- **In the inbox:** Your turn is warning, and so is a manager's Waiting (a waiting guest on a thread that isn't theirs, ADR 0022); Sent is success, the pipe (WhatsApp / Zalo) and the owner (a name, "Yours" or "Unassigned") are neutral. Only a manager sees the owner badge: an agent sees only their own threads (ADR 0022), so for them it would always say "Yours" (#94). Row and thread header use the same badges in the same order: pipe, owner, then turn. The CRM status ("In CRM", neutral) is metadata like the owner: last in the thread header on a narrow thread panel, in the details rail on a wide one (#248). When the office has a CRM and the thread's lead isn't written yet, it reads "Not in CRM yet", neutral too: a missing lead is a fact Nhịp is fixing, not an error (The Red Means Broken Rule, #211). An office with no CRM shows no CRM status.
- **Won and Lost:** while a thread is resolved (ADR 0003), the CRM's outcome takes the turn's place as a neutral badge, on the row and the header. Neither is colored: an outcome is not the turn (The Turn Is The Signal Rule), and Lost is not an error. When the guest writes again, the turn badge comes back.
- **A badge that opens the CRM (`BadgeLink`):** where the office's CRM has a web app and Nhịp knows the office's account there (HubSpot), "In CRM" is a link to the thread's lead in it, opening in a new tab. It stays the neutral squared badge, not a pill: it leaves Nhịp rather than acting in it. A 12px external-link icon after the label (4px gap) says it goes elsewhere; hover darkens the label and icon to ink, and keyboard focus shows the focus ring. On the mock CRM, and until Nhịp knows the account, it is the plain badge. "Not in CRM yet" is never a link.
- **Count (`numeric`):** the same badge in Count type (Plex Mono, tabular). The amber count of Your-turn threads rides on the Inbox nav item on every page, and on Waiting now's title.
- **Inline (`size="sm"`):** 16px, 6px padding, Micro Caps size in sentence case; the info-toned mock badge on a message's meta line, and the neutral "Auto-reply" badge on the automatic greeting's, followed by "Model" or "Template" in Slate Note (ADR 0021).
- **In Admin:** connected and filed are success; banned, needs-reconnect, failed and refused are error; an office with no pipe ("none") and a dropped delivery are neutral, because an absence is not a failure.

### Cards / Panels

- **Corner Style:** 13.2px (`rounded-3xl`).
- **Background:** Plain White / Night Card on the canvas, 1px Hairline Blue border.
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** 24px for kit cards; Home's panels pad 16px (20px from `md`) with a title row (Be Vietnam Pro semibold, Slate Note meta on the right). `CardTitle` is semibold (600), the Title role.
- **Dividers:** a panel split into cells uses hairlines between cells, not gaps.

### Inputs / Fields

- **Style:** 36px tall, Field Edge 1px stroke, card background, 8.4px radius, 12px horizontal padding, 1rem text (16px, so iOS doesn't zoom on focus).
- **Focus:** the stroke turns Dispatch Blue, with a 1px blue ring.
- **Placeholder:** 60% ink. **Disabled:** 50% opacity and a not-allowed cursor.
- **Search (`variant="search"`):** the inbox search, at the top of the list panel: 48px tall, a Morning Wash fill with no stroke, 4.8px radius, and 48px of left padding for the leading icon.

### View Tabs

A pill toggle on Morning Wash with a hairline, 2px inner padding. Tabs are pills in 0.75rem semibold, 44px tall below `md` and 32px from `md`; inactive in Slate Note, the active one a white pill with the Hairline shadow. Each carries its count in Plex Mono at `text-micro` (the Count size, 0.6875rem), full Slate Note. The tabs sit on one line and never scroll: each is as wide as its label and full count (never "99+"), and when the row runs short their side padding steps down from 12px to 8px, then to 4px with the label–count gap from 6px to 4px, before anything wraps, as a manager's four Vietnamese tabs with three-digit counts do at the list's 22rem. Once the padding has had to step down, the tabs stretch to share the whole row, each growing from its own width, so the room left is inside the pills, not after them (#94). With the counts at 11px, the last step is 2px padding and a 2px label–count gap. The tab row never moves between views: a manager's owner filter keeps its row above search in every view (see "Inbox."). A manager's Your turn tab reads Waiting (it holds the office's waiting guests, ADR 0022); an agent's stays Your turn. After the tabs (beside them where the row has room, otherwise under them), a Body Small count line in Slate Note: an agent's says how many guests wait on them; a manager's names the view's own count, then how many wait in the office ("4 unassigned · 6 waiting in the office"), or on the operator the owner filter shows. A manager's Waiting line is only the waiting count, which is that view's own.

### Navigation

- **Style:** the sidebar is the canvas, borderless; the canvas fill (`bg-canvas`) sits on the kit's `SidebarProvider` wrapper. Items are icon + label, with Lucide icons at stroke 1.5; inactive labels at 75% ink.
- **Variant:** `SidebarMenuButton variant="chip"` carries the whole treatment, so the app passes no restyle classes.
- **Active:** a white chip with the Hairline shadow, ink text, the icon in Dispatch Blue. The settings entry in the user menu uses the same chip.
- **Hover:** Hairline Blue accent fill.
- **Coming soon:** a later feature named in PRODUCT.md's "Later, shown as Coming soon" list sits where it will live as a disabled item (the kit's 50% opacity, no link), with a neutral `Badge` reading "Coming soon" at its right edge. Paperwork (foreigners' documents in Vietnam) sits under Inbox, and CRM (the built-in CRM, #126; Lucide `ContactRound`) right after it. In the collapsed sidebar each is the dimmed icon alone, and its tooltip names it with the same "Coming soon" badge (#234); it still links nowhere. The platform admin, who sees only the admin area, gets neither.
- **Count:** while any thread is Your turn, the Inbox link carries a numeric warning `Badge` at its right edge (`ml-auto`), inside the link itself. In the collapsed sidebar it is a compact count pinned to the icon's top-right corner (`size="corner"`: 16px tall, the 11px Count type, "99+" past 99), its right edge fixed 12px past the icon's item so it stays on the strip, overlapping only the icon's corner, on a canvas backing with a 2px canvas ring, so its 12% tint reads over the icon (#94). The bell's unread count is the same squared badge, info-toned (`numeric`, `size="sm"`), on the bell's top-right corner with the same backing; never a round pill (#94).
- **Bell rows:** each row is an icon, its title, and a Clock time at its right; under it, in Body Small Slate Note, what the row can say without naming a guest: a thread given to the reader shows its pipe and language ("WhatsApp · Korean", ADR 0019). Back-to-back "A manager gave you a thread" rows fold into one, "5 threads were assigned to you", opening the Inbox (#94).
- **Collapse (from `lg`):** the sidebar collapses to a 48px icon strip and back by a ghost icon button beside the bell (the kit's `SidebarTrigger`, 32px), by ⌘B / Ctrl+B, or by the rail on its edge, and keeps the state in the kit's `sidebar_state` cookie, which the server reads so a reload paints the same state. Collapsed, the button heads the strip, above the logo and the bell; its tooltip says what it does and the shortcut as this computer writes it ("Collapse sidebar (⌘B)", "Expand sidebar (Ctrl+B)"). Every strip item has a tooltip naming it.
- **Motion:** the width moves over 220ms ease-out, and the labels fade with it (opacity, same curve) while the 32px items clip them. Both stop under `prefers-reduced-motion`.
- **Phone (below `lg`):** the sidebar is a sheet behind the 56px top bar; links are 44px tall; the same active treatment applies.

### Page Header

Page Title on the left with a Slate Note subtitle under it; an optional aside on the right, bottom-aligned, for something that qualifies the whole page (Home's window: a 28px squared chip, white with the Hairline shadow, 0.75rem Slate Note).

### Thread Row (signature)

The unit of the desk: who, when, what they said, whose turn.

- **Structure:** guest mark (32px, 4.8px radius, Touch Blue initials on a 12% blue tint), then name and Clock timestamp (sans, tabular) on one baseline, a two-line Body Small preview, then badges. A guest known only by their WhatsApp number reads as it, with its country code ("+1 202 555 0107"), and their mark is a phone glyph instead of a digit (#94).
- **Rest:** transparent, 8.4px radius. **Hover:** 70% Morning Wash.
- **Active (`aria-current`):** a Hairline Blue fill, and the guest mark turns solid Dispatch Blue with white initials (200ms). No press-scale, no stripe.
- **Quiet threads** fold under a `<details>` disclosure at the list's foot (44px summary, Body Small, Slate Note, with its count), led by a chevron that turns down when it opens (200ms, none under reduced motion).
- **Assign to… (a manager's Unassigned rows, ADR 0022):** a small ghost pill at the row's end, which opens the kit's dropdown of the office's operators. It's a control, so it's a pill (The Pill Acts Rule). Below `md` it's always there: a 44px tap target on the badges' last line. From `md` it's the 24px pill on the name's line, as the view tabs shrink from `md`, so the badges keep the row's whole width; it shows only on the row's hover, on focus within the row, on the selected row and while its menu is open, and then it takes the timestamp's place. On a touch screen from `md`, where nothing hovers, it shows on every row, still in the timestamp's place. The name is never under it: at rest the name has the line's whole width, and while the pill shows it ends before the pill. The pill's label never truncates. It never selects the row, and it acts at once, as the header's owner menu does.

### Message

Chat bubbles, capped at 36rem (`max-w-xl`), with 16px between them.

- **Inbound (guest):** on the left; card background with the Hairline shadow, 8.4px radius, 10px × 14px padding, Body type.
- **Outbound (us):** on the right; Morning Wash, no edge.
- **Translation:** inside the guest's bubble, a muted second block (Body Small, Slate Note) under a Hairline Blue rule. No label: the line and the tone say it.
- **Meta line:** under the bubble, on its side, in Body Small Slate Note: the source on our messages ("Sent from Nhịp", or the neutral inline "Auto-reply" badge then "Model" / "Template"), an optional inline mock badge, then a Clock time (sans, tabular). A guest's bubble needs no source: its side says who wrote it.

### Operator Note

One short line in Body Small Slate Note beside the reply box's "Reply" label: the language the reply is in and "don't interview" ("in Korean · don't interview"). The guest's facts and the paperwork flag are in the details, so the note never repeats them (#248).

### Reply Box (docked)

The foot of the conversation column, always in view: card background tinted 40% Morning Wash, top hairline, 12px × 20px. A first row holds "Reply" (Be Vietnam Pro semibold, 0.875rem), the operator note, and, while the box holds the server's suggestion, where it came from, with Regenerate (ghost, 44px target) at its end. Then the textarea (at least 80px, at most 12rem before it scrolls; on a phone it grows with the draft up to that height). The last row has a polite live-region status in Body Small on the left (Slate Note, or Signal Red when a send failed or a pipe is disconnected) and Approve and send on the right, at least 44px tall. While no guest message waits for an answer, the box folds to one 44px line: a Sent Green check and, in Body Small Slate Note, "Answered · Sent <when> · waiting for the guest", with no draft and no disabled Approve; it comes back when the guest writes. An unknown or failed send keeps the whole box (#94).

### Guest Details (rail and strip)

- **Rail:** 22rem, a hairline on its left, scrolling on its own. Sections split by hairlines, 16px padding, each titled in Micro-Caps-style Be Vietnam Pro semibold 0.75rem uppercase Slate Note: Guest details (the known fields in the `grid-cols-fields` grid, the Missing row last), CRM (the CRM status badge; no section when the office has no CRM), and Owner (the manager's Assign to; for an agent, the owner's name, read-only).
- **Strip:** under the header, 40% Morning Wash, bottom hairline, 8px × 16px, Body Small: each present field as a Slate Note label then its value in ink, wrapping, the Missing pair last.
- **Missing row (#244):** what the agent should still ask for is one more row of the details, like the others: the label "Missing" in the label column, and as its value the names ("budget, move-in") in Your-Turn Amber (`text-warning`, the Waiting badge's tone): a guest still owes these. Never a count, never a separate line, and never a control or a fold (no pill, no disclosure: The Pill Acts Rule; a fold was considered and rejected on #261). Only the auto-reply's asks count, in its order (rent or buy, area, budget, move-in, beds / household; `missingQualifiers` in `greeting.ts`), named by their field labels lower-cased. Nationality and In Vietnam now show only when known, paperwork only when mentioned. Nothing missing, no row.

### Owner Select

Assign to, on the open thread, and the manager's Showing filter over the list are the kit's `Select` (Base UI), never a native `<select>`: a field-shaped trigger showing the current choice (36px and 1rem in the details rail; `size="sm"`, 32px and 0.875rem, in the thread header and over the list), and a floating list of the office's operators, in the same order as a row's Assign to… menu. `nhip/no-native-select` refuses a JSX `<select>` outside `packages/ui`.

### Waiting Now (Home)

The office's Your-turn queue in inbox order, oldest first, at most five rows; a manager's lists Unassigned leads first (ADR 0022). The card is `min-w-0`, so a long name truncates instead of widening the grid. Each row (at least 56px, 8.4px radius) opens its thread: guest mark, name, pipe badge and language, and the wait time in amber on the right. A full-width outline Open inbox button closes the panel.

### Funnel Strip (Home)

One panel, five cells split by hairlines: Leads in, Engaged, In conversation, Closings, Lost. Each cell has a mono stage number (full Slate Note) beside its label, a Figure, a thin 4px share bar on the track (Chart Strong), and a Body Small hint. Closings and Lost come from the office's CRM: distinct won and lost leads of the window, from the outcomes Nhịp cached, with the hint "As of <time>" (the last time Nhịp heard from the CRM, in the office's time zone) or "Nothing from your CRM yet." before it has heard anything (#68). An office with no CRM shows a 40px hatched box with a white "No CRM" chip instead of a figure, and the panel's hint reads "Closings and lost come from your CRM. Nhịp connects the one your office uses." Never a call to connect: managers can't (PRODUCT.md, 2026-10-04).

### Charts (Home)

- **Leads by day:** the kit's recharts wrapper. Bars in Chart Soft, today in Chart Strong, 2px top corners, horizontal gridlines only, three y ticks, a date under every seventh day. The track color is the hover cursor.
- **Response time:** titled as every Home panel is (Be Vietnam Pro semibold, 0.875rem on a phone, 1rem from `md`); the median as a Figure, the p90 and answered count in Slate Note under it, then four bucket rows (label, 14px bar, mono count and share); the fastest bucket is strong, the rest soft.

## Do's and Don'ts

### Do:

- **Do** use Dispatch Blue (#2563eb) for every primary action and for nothing decorative.
- **Do** show the turn with the badge pair: Your-Turn Amber (#92400e) at 12% for waiting, Sent Green (#166534) at 12% for answered.
- **Do** put content on a panel (13.2px, 1px Hairline Blue, no shadow) on the Desk Canvas (#f2f5fb).
- **Do** mark selection with a fill: Hairline Blue plus a solid guest mark on rows, a white Hairline chip in the nav.
- **Do** keep tappable controls in the inbox and the phone shell at least 44px tall (`min-h-11`), even when the visual button is smaller.
- **Do** set digit-only content (figures, counts) in IBM Plex Mono with `tabular-nums`, and timestamps, words and units in Noto Sans (timestamps with `tabular-nums`).
- **Do** draw charts in one blue at two strengths: Chart Strong for the value to read first, Chart Soft for the rest, on Chart Track.
- **Do** hatch a number Nhịp does not have yet and say why in a neutral chip.
- **Do** use theme tokens for one-off values (`text-micro`, `text-2xs`, `text-figure`, `w-row-inset`, `--container-inbox-list`); `@shadcn/lint` rejects raw colors, arbitrary values and inline styles in the app.
- **Do** give every color a night twin in both `:root` and `.dark` when you add one.

### Don't:

- **Don't** reintroduce the 2px left rail or any colored side stripe, on rows, messages, notes or navigation.
- **Don't** add a second accent color, a gradient, or brand illustration inside the inbox.
- **Don't** add a second hue to a chart.
- **Don't** show a zero for a number Nhịp doesn't have; a zero reads as a fact.
- **Don't** use Signal Red (#dc2626) for waiting or overdue leads; red means an error or a destructive action.
- **Don't** add drop shadows or elevation on hover; state is a tonal fill. Only floating layers keep the kit's shadow.
- **Don't** give the sidebar its own border or surface; it is the canvas.
- **Don't** set words, units or timestamps in mono; mono is for digit-only content.
- **Don't** make status or metadata into pills, or build a second status component; status is a squared `Badge`.
- **Don't** use grey borders; borders are Hairline Blue (#e4ecfc) / Night Hairline (#253352).
- **Don't** write arbitrary Tailwind values (`text-[11px]`, `w-[calc(...)]`) in app code; name the value as a theme token in `apps/saas/app/globals.css`.
- **Don't** restyle a `@repo/ui` component with `className` beyond layout; `shadcn/no-restyle` enforces it. Use a variant or size, or add one when the design calls for it.
- **Don't** stack contradictory utilities (`rounded-full rounded-md`, `bg-primary bg-touch/12`); a plain `className` without `cn()` resolves them by stylesheet order, not by position.
