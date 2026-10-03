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
  rail-paper: "#f8fafc"
  dispatch-blue: "#2563eb"
  touch-blue: "#2563eb"
  signal-red: "#dc2626"
  sent-green: "#15803d"
  your-turn-amber: "#b45309"
  night-desk: "#0b1220"
  night-card: "#111a2e"
  night-wash: "#1b2740"
  night-hairline: "#253352"
  night-ink: "#e2e8f0"
  night-note: "#94a3b8"
  night-blue: "#3b82f6"
  night-touch: "#60a5fa"
typography:
  headline:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
  title:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.1
  thread-name:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
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
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
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
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.3xl}"
    padding: "24px"
  thread-row:
    backgroundColor: "transparent"
    textColor: "{colors.harbor-ink}"
    rounded: "0"
    padding: "10px 12px"
  thread-row-active:
    backgroundColor: "{colors.hairline-blue}"
  guest-mark:
    backgroundColor: "color-mix(in srgb, #2563eb 12%, transparent)"
    textColor: "{colors.touch-blue}"
    rounded: "{rounded.md}"
    size: "32px"
  flag-your-turn:
    backgroundColor: "color-mix(in srgb, #b45309 12%, transparent)"
    textColor: "{colors.your-turn-amber}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "20px"
  flag-sent:
    backgroundColor: "color-mix(in srgb, #15803d 12%, transparent)"
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
    rounded: "{rounded.md}"
    padding: "8px 12px"
  message-outbound:
    backgroundColor: "color-mix(in srgb, #f1f5fd 40%, transparent)"
    textColor: "{colors.harbor-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.hairline-blue}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.md}"
---

# Design System: Nhịp

## Overview

**Creative North Star: "The Dispatch Desk"**

Nhịp is the desk where every new lead lands and someone answers it before it goes cold. The screen has one job: show which guest is waiting, whose turn it is, and put the reply one tap away. Everything else stays quiet. The surfaces are flat white (or deep night blue in dark mode) with hairline blue edges, and one saturated blue marks every action and the thread you're looking at. The only other color is the turn itself: amber for _your turn_, green for _sent_. Red is kept for things that broke.

The desk is dense but calm. Agents work it on a phone and at a desk about equally, so the thread list and the thread are the same product in both places: one column on a phone, list and thread side by side from `md` up. Density comes from tight rows and small, exact type, not from shrinking touch targets. Every control someone taps mid-conversation is at least 44px tall.

The system comes from a supastarter kit, refit for triage. Pills are for acting, gently squared corners are for content, and depth comes from tone, never from drop shadows. Headings are in Be Vietnam Pro and body text in Noto Sans. Both carry the Vietnamese subset, so diacritics set cleanly at every size.

**Key Characteristics:**

- One action blue; the turn (amber / green) is the only other signal on a row.
- Flat surfaces: tonal washes and 1–2px inset lines instead of shadows.
- Pill buttons, squared content (rows, flags, messages, fields).
- A 2px left rail marks "selected" everywhere: thread rows, inbound messages, the sidebar.
- Timestamps in IBM Plex Mono with tabular figures.
- Light and dark themes are both first-class; every token has a night twin.

## Colors

Cool, low-chroma slate and blue neutrals carrying a single saturated blue, with amber, green and red reserved for state.

### Primary

- **Dispatch Blue** (#2563eb; night #3b82f6): the one action color. Primary buttons, links, the focus ring (`--ring`), the active sidebar marker, the info badge. When something on screen is blue and solid, you can press it.
- **Touch Blue** (#2563eb; night #60a5fa): the selection rail and guest avatar tint (`--touch`). The same hue as Dispatch Blue in light mode, lifted in dark mode so a 2px rail still reads on night surfaces.

### Neutral

- **Plain White** (#ffffff): page and card background in light mode.
- **Harbor Ink** (#0f172a): body text and headings. Deep slate, not black.
- **Slate Note** (#475569): secondary text, such as previews, metadata, empty-state sentences and the send-status line.
- **Morning Wash** (#f1f5fd): the secondary button fill, muted surfaces, the pipe flag, the send bar tint.
- **Deep Navy** (#1e3a8a): text on Morning Wash (secondary buttons).
- **Hairline Blue** (#e4ecfc): every border and divider, and the accent fill for the active thread row and hovered menu items. Borders are blue-tinted, never grey.
- **Field Edge** (#cbd9f5): input strokes, one step stronger than Hairline Blue so fields read as fields.
- **Rail Paper** (#f8fafc): the sidebar surface, a breath off white.
- **Night Desk / Night Card / Night Wash / Night Hairline** (#0b1220 / #111a2e / #1b2740 / #253352): the dark-mode background, card, muted and border steps. **Night Ink** (#e2e8f0) and **Night Note** (#94a3b8) are its text colors.

### State

- **Your-Turn Amber** (#b45309; night #fbbf24): the guest wrote last and nobody has answered. Used only as a 12% tint with amber text.
- **Sent Green** (#15803d; night #4ade80): our reply went out. The same 12% tint treatment.
- **Signal Red** (#dc2626; night #f87171): errors, failed sends, destructive actions. Nothing else.

### Named Rules

**The One Blue Rule.** Blue is the only action color. No second accent, no gradient, no brand purple. If a new control needs emphasis, it's primary blue or it's neutral.

**The Turn Is The Signal Rule.** On a thread, only the turn gets color: amber while the guest waits, green once we've answered. Pipe, owner and other metadata stay neutral grey-blue so the turn is readable from across the room.

**The Red Means Broken Rule.** Signal Red is for errors and destructive actions only. A waiting guest is amber, never red. Urgency is not an error.

## Typography

**Heading Font:** Be Vietnam Pro (with ui-sans-serif, system-ui)
**Body Font:** Noto Sans (with ui-sans-serif, system-ui)
**Mono Font:** IBM Plex Mono (with ui-monospace)

**Character:** A Vietnamese-designed geometric sans for names and headings, paired with a neutral humanist workhorse for messages. Both draw full Vietnamese diacritics. `h1`–`h3` and `.font-heading` switch to Be Vietnam Pro automatically.

### Hierarchy

- **Headline** (700, 1.25rem on a phone, 1.5rem from `md`): page titles such as Settings, Admin and auth screens.
- **Title** (600, 1.125rem, 1.1): card titles and section headers.
- **Thread Name** (Be Vietnam Pro 600, 0.875rem, −0.025em): the guest's name on a row and in the thread header. The only heading face inside the inbox.
- **Body** (400, 0.875rem, 1.625): message text, with `pre-wrap` so guests' line breaks survive.
- **Body Small** (400, 0.75rem, 1.375): row previews (clamped to 2 lines), message meta, hints.
- **Label** (500, 0.6875rem, `text-micro`): flags, avatar initials.
- **Micro Caps** (500, 0.625rem, `text-2xs`, +0.025em, uppercase): the translation label under a message. The inline mock badge (`Badge size="sm"`) uses the same size in sentence case.
- **Clock** (Plex Mono, 0.6875rem, tabular figures): every timestamp, so times line up down the list.

### Named Rules

**The Tabular Clock Rule.** Times are always Plex Mono with `tabular-nums`. Proportional digits make a column of times jitter.

**The Theme Sizes Rule.** Sizes below 0.75rem use the theme tokens (`text-micro`, `text-2xs`), never arbitrary values. `cn()` knows these tokens, so they survive a text color merged after them.

## Layout

The inbox is a two-pane desk. From `md` up, the thread list is a fixed column (`--container-inbox-list`, 22rem) with a right border, and the thread fills the rest. Below `md` the two panes swap: the list, then a thread with a back action. There's no separate mobile design, only the same components on a narrower desk.

Rows are inset from the list edge by 6px on each side (`w-row-inset`) with 2px of vertical gap, so the active fill doesn't touch the column border. Rows pad 10px × 12px with a 10px gap between avatar and text. Empty states are one centred sentence capped at 22ch (`--container-empty-note`), with an optional outline button under it.

Tap targets that matter mid-conversation (Send, Retry, View sent, the Quiet disclosure) are at least 44px tall (`min-h-11`), even where the button's visual height is 36px. Settings use a label/control grid: a third of the width for the label, capped at 360px (`grid-cols-setting`). Extracted fields use a `minmax(7rem, auto) 1fr` label/value grid (`grid-cols-fields`). Marketing and settings pages sit in a `max-w-7xl` container with 1.5rem side padding. Spacing is Tailwind's 4px step. The inbox lives on 6, 8, 10 and 12px.

## Elevation & Depth

Nhịp is flat. Depth comes from tone: white or Night Desk for the page, Rail Paper for the sidebar, Morning Wash for muted strips such as the send bar and outbound messages, Hairline Blue for selection. Inputs keep the kit's `shadow-xs` hairline. Otherwise there are no drop shadows, and no blur or glass. The two named shadows below are really lines, drawn inside the box so they never shift layout.

### Shadow Vocabulary

- **Rail** (`box-shadow: inset 2px 0 0 var(--sidebar-primary)`): the active item in the sidebar and user menu.
- **Hairline** (`box-shadow: inset 0 0 0 1px var(--border)`): a 1px border drawn inside, for chips and toggles that sit on a tinted surface.

### Named Rules

**The Flat Desk Rule.** Surfaces are flat at rest and flat on hover. State shows as a tonal fill or a 2px rail, never as lift.

## Shapes

One base radius (6px, `--radius: 0.375rem`) scaled by fixed factors: sm 3.6px, md 4.8px, lg 6px, xl 8.4px, 2xl 10.8px, 3xl 13.2px, 4xl 15.6px. Actions are pills (`rounded-full`). Content is gently squared: messages, flags and the guest mark use md (4.8px), inputs use xl (8.4px), and cards use 3xl (13.2px) so they read as containers. Thread rows are square-cornered, because their left rail needs a straight edge to sit on.

**The Pill Acts Rule.** If it's fully round, it does something. Status and metadata are never pills; they're small squared flags.

## Components

### Buttons

Confident, compact pills that press in slightly.

- **Shape:** full pill (9999px) at every size: sm 24px, md 36px (default), lg 48px, icon 32px square-round.
- **Primary:** Dispatch Blue fill, white text, 16px horizontal padding, semibold 0.875rem. Hover mixes the blue 82% toward the background.
- **Secondary (default variant):** Morning Wash fill, Deep Navy text; hover darkens it 10%.
- **Outline:** a 10% ink border on transparent; hover adds a 10% ink wash. It's the choice for the secondary action in an empty or error state.
- **Ghost:** no fill until hover (10% ink wash). Thread rows are not Buttons; they are their own row element (see Thread Row).
- **Destructive:** Signal Red fill; only for the irreversible.
- **Focus:** 2px Dispatch Blue ring, offset 2px from the background.
- **Active:** scales to 0.98 over 200ms ease-out. Motion stops under `prefers-reduced-motion`.
- **Loading:** a spinner before the label; the button keeps its width.

### Flags (the turn and the pipe)

- **Style:** 20px tall, 8px horizontal padding, 4.8px radius, Label type (500, 0.6875rem), no border.
- **Your turn:** Your-Turn Amber text on a 12% amber tint. **Sent:** Sent Green on a 12% green tint. **Pipe (WhatsApp / Zalo):** Slate Note on Morning Wash.
- Row and thread header use the same flags, in the same order: pipe first, then turn.

### Cards / Containers

- **Corner Style:** 13.2px (`rounded-3xl`).
- **Background:** Plain White / Night Card, 1px Hairline Blue border.
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** 24px, with a 16px gap under the header.

### Inputs / Fields

- **Style:** 36px tall, Field Edge 1px stroke, card background, 8.4px radius, 12px horizontal padding, 1rem text (16px, so iOS doesn't zoom on focus).
- **Focus:** the stroke turns Dispatch Blue, with a 1px blue ring.
- **Placeholder:** 60% ink. **Disabled:** 50% opacity and a not-allowed cursor.
- **Search (`variant="search"`):** the inbox search: 48px tall, a Morning Wash fill with no stroke, 4.8px radius, and 48px of left padding for the leading icon.

### Navigation

- **Style:** a Rail Paper sidebar. Items are icon + label, with Lucide icons at stroke 1.5.
- **Active:** a Hairline Blue fill plus the Rail shadow (2px Dispatch Blue on the inside left).
- **Hover:** accent fill without the rail.
- **Phone:** the sidebar collapses to a sheet; the same active treatment applies.

### Thread Row (signature)

The unit of the desk: who, when, what they said, whose turn.

- **Structure:** guest mark (32px, 4.8px radius, Touch Blue initials on a 12% blue tint), then name and Clock timestamp on one baseline, a two-line Body Small preview, then flags.
- **Rest:** transparent, 2px transparent left border, square corners. **Hover:** 70% Morning Wash.
- **Active:** Touch Blue left rail and an 80% Hairline Blue fill (`aria-current`); no press-scale.
- **Quiet threads** fold under a `<details>` disclosure at the list's foot (44px summary, Body Small, Slate Note).

### Message

- **Inbound (guest):** card background, 2px Touch Blue left rail, 4.8px radius, 8px × 12px padding, Body type.
- **Outbound (us):** indented 24px from the left, 40% Morning Wash, a 2px rail at 20% ink.
- **Meta line:** the source in 80% ink, then a Clock time and an optional micro badge. A translation sits under a dashed hairline with a Micro Caps label.

### Send Bar

A strip under the thread: card background tinted 40% Morning Wash, top hairline, 8px × 12px. On the left, a polite live-region status in Body Small (Slate Note, or Signal Red when a send failed or a pipe is disconnected). On the right, the Send button, at least 44px tall.

## Do's and Don'ts

### Do:

- **Do** use Dispatch Blue (#2563eb) for every primary action and for nothing decorative.
- **Do** show the turn with the flag pair: Your-Turn Amber (#b45309) at 12% for waiting, Sent Green (#15803d) at 12% for answered.
- **Do** mark selection with a 2px left rail (Touch Blue on rows and inbound messages, `shadow-rail` in navigation).
- **Do** keep tappable controls in the inbox at least 44px tall (`min-h-11`), even when the visual button is 36px.
- **Do** set timestamps in IBM Plex Mono with `tabular-nums`.
- **Do** use theme tokens for one-off values (`text-micro`, `text-2xs`, `w-row-inset`, `--container-inbox-list`); `@shadcn/lint` rejects raw colors, arbitrary values and inline styles in the app.
- **Do** give every color a night twin in both `:root` and `.dark` when you add one.

### Don't:

- **Don't** add a second accent color, a gradient, or brand illustration inside the inbox.
- **Don't** use Signal Red (#dc2626) for waiting or overdue leads; red means an error or a destructive action.
- **Don't** add drop shadows or elevation on hover; state is a tonal fill or a rail.
- **Don't** make status or metadata into pills; round shapes are for actions.
- **Don't** use grey borders; borders are Hairline Blue (#e4ecfc) / Night Hairline (#253352).
- **Don't** write arbitrary Tailwind values (`text-[11px]`, `w-[calc(...)]`) in app code; name the value as a theme token in `apps/saas/app/globals.css`.
- **Don't** restyle a `@repo/ui` component with `className` beyond layout; `shadcn/no-restyle` enforces it. Use a variant or size, or add one when the design calls for it.
- **Don't** stack contradictory utilities (`rounded-full rounded-md`, `bg-primary bg-touch/12`); a plain `className` without `cn()` resolves them by stylesheet order, not by position.
