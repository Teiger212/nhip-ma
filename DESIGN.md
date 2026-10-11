---
name: Nhịp
description: A speed-to-lead inbox for Vietnamese apartment agencies. Navy ink on a marble desk, with one sheet of white paper for the thread you are working on.
colors:
  ink-navy: "#0b3558"
  slate: "#476788"
  mist: "#a6bbd1"
  marble: "#f8f9fb"
  paper: "#ffffff"
  pebble: "#f0f3f8"
  pebble-strong: "#e7ecf3"
  hairline: "#d4e0ed"
  signal-blue: "#006bff"
  signal-tint: "#e6f0ff"
  signal-red: "#dc2626"
  sent-green: "#166534"
  amber-note: "#92400e"
  chart-soft: "#a9cbff"
  chart-track: "#d4e0ed"
  tag-violet: "#ece9f7"
  tag-violet-ink: "#4f3f8a"
  tag-teal: "#e0f0ed"
  tag-teal-ink: "#1c5b53"
  tag-rose: "#f7e6ee"
  tag-rose-ink: "#8a325c"
  tag-amber: "#f5eed8"
  tag-amber-ink: "#6b5312"
  tag-berry: "#f8e4e7"
  tag-berry-ink: "#94303f"
  tag-lagoon: "#dff0f3"
  tag-lagoon-ink: "#17596a"
  tag-sage: "#e3efe0"
  tag-sage-ink: "#335e34"
  tag-moss: "#eef0d8"
  tag-moss-ink: "#555a15"
  tag-plain: "#edf1f6"
  tag-plain-ink: "#476788"
  area-copper: "#8a4a24"
  area-cocoa: "#6b4f3a"
  area-pine: "#2e5a46"
  area-plum: "#6a3d63"
  area-steel: "#3d5670"
  area-olive: "#5a5a26"
  night-canvas: "#071423"
  night-card: "#0d1f33"
  night-muted: "#142a42"
  night-hairline: "#1f3a57"
  night-ink: "#e3ecf6"
  night-slate: "#9fb4cc"
  night-signal: "#4d94ff"
typography:
  wordmark:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Manrope, sans-serif"
    fontSize: "2.375rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  figure-sm:
    fontFamily: "Manrope, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  stay-title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  thread-title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, 'Apple SD Gothic Neo', 'Hiragino Sans', 'PingFang SC', 'Noto Sans CJK KR', 'Noto Sans KR', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  name:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
  note:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: "1.125rem"
  body-small:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.75rem"
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
  panel-heading:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  field-key:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 800
    lineHeight: 1.45
    letterSpacing: "0.04em"
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  plate: "4px"
  mark: "6px"
  control: "8px"
  row: "12px"
  panel: "16px"
spacing:
  step: "4px"
  row-inset: "6px"
  card-inset: "12px"
  tap: "44px"
  inbox-list: "23.25rem"
  thread-rail: "18.75rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "24px"
  view-tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.control}"
    height: "40px"
  view-tab-active:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "40px"
  plate-your-turn:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.plate}"
    height: "22px"
  plate-waiting:
    textColor: "{colors.slate}"
    rounded: "{rounded.plate}"
    height: "22px"
  language-marker:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.marble}"
    rounded: "{rounded.control}"
    size: "28px"
  fact-tag:
    backgroundColor: "{colors.tag-violet}"
    textColor: "{colors.tag-violet-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    height: "18px"
  area-tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.area-copper}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    height: "18px"
  input-search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.control}"
    padding: "0 12px 0 36px"
    height: "36px"
---

# Design System: Nhịp

## Overview

**Creative North Star: "Navy on Marble"**

Navy on Marble+ was decided by Eyal on 2026-10-11 (#314), from five rounds of mockups
(`reports/design/directions-2026-10-11/navy-marble-plus.html`, local only), with its ink system
borrowed from the Calendly style reference in `reports/design/DESIGN.md`.

Nhịp is a desk where every new lead lands and someone answers it before it goes cold. The
desk is a cool marble canvas. Every glyph on it is Ink Navy. Content sits on white paper edged
in 1px hairlines, and exactly one surface per screen is raised: the thread you are working on,
lifted by a soft, blue-tinted, three-layer shadow. Signal Blue fills only two things: the
primary action (Approve and send) and what is selected (the view you are on, the row you have
open). Navy fills the secondary action (Regenerate) and the turn that is yours.

**Key Characteristics:**

- A navy "Your turn" plate, an outlined "Waiting" plate with a clock, and a bare "Sent" with
  a check.
- Language-code guest markers (KO, EN, JA, VI, ZH, RU) in place of letter avatars: filled
  for your turn, outlined while waiting, muted once sent.
- Colour-coded fact tags (language, area, beds, budget) under each row's preview. Each value
  keeps one colour everywhere.
- A stay card at the top of the guest details, the way a booking summary opens on the slot
  you picked.
- Slot-style view tabs: a small label over a big count, the active one filled.
- The "Nhịp" wordmark, with a legible dot under the ị.

## Colors

All tokens live in `tooling/tailwind/theme.css` (`:root` and `.dark`) under the kit's semantic
names, so every screen (settings, admin, auth) follows without per-component edits.

### Ink

- **Ink Navy** (#0b3558, `foreground`): all text and icons, headings and body alike, and the
  fill of the Your turn plate, a Your turn marker, the secondary button (`secondary`) and the
  collapsed sidebar's count.
- **Slate** (#476788, `muted-foreground`): secondary text: previews, hints, labels, times,
  the pipe, Waiting and Sent plates, and the Missing row.
- **Mist** (#a6bbd1, `mist`): marks only, never readable text: the Waiting plate's outline,
  a Waiting marker's outline (`border-mark`, 1.5px), a dashed open slot (`border-open`).

### Paper and canvas

- **Marble** (#f8f9fb, `background`, `canvas`, `sidebar`): the app's ground, the sidebar and
  the list column, which are one surface.
- **Paper** (#ffffff, `card`, `popover`, `sidebar-accent`): the thread card, the selected row,
  the active nav item, inputs, tabs, outbound bubbles and the reply dock.
- **Pebble** (#f0f3f8, `muted`): an inbound bubble's fill and muted surfaces.
  **Pebble Strong** (#e7ecf3, `muted-strong`): a Sent marker's fill.
- **Hairline** (#d4e0ed, `border`, `input`): every border, divider and input stroke.

### Signal

- **Signal Blue** (#006bff, `primary`, `ring`, `touch`): the primary button, the selected view
  tab, the selected row's edge, the focus ring and the caret. Nothing decorative.
- **Signal Tint** (#e6f0ff, `accent`): a hovered menu item and the text selection.

### State

- **Signal Red** (#dc2626, `destructive`): errors, failed sends, disconnected pipes and
  destructive actions. Nothing else.
- **Sent Green** (#166534, `success`) and **Amber Note** (#92400e, `warning`) stay for the
  kit's success and warning badges (Admin's connected/filed, toasts, the answered check). The
  turn no longer uses them: the turn is navy, outlined or bare.

### Fact tags

Nine muted pairs for languages, beds and budget (`tag-*`, fill and text, each 4.5:1 or better):
violet, teal, rose, amber, berry, lagoon, sage, moss, and plain (Slate on #edf1f6). Never Signal
Blue.

- **Languages** keep a fixed colour (`apps/saas/modules/inbox/lib/fact-tags.ts`): Korean
  violet, English teal, Japanese rose, Vietnamese amber, Chinese berry, Russian lagoon, French
  sage, German moss. Any other code hashes into the eight hues.
- **Areas** have their own palette, never a language's (Eyal, 2026-10-11): six earth tones
  (`area-*`: copper, cocoa, pine, plum, steel, olive), drawn as an outline with a small pin on
  white, not as a fill. An area hashes into the six (FNV-1a over the name, Unicode-normalised,
  trimmed, spacing and case folded), so "Tây Hồ" is the same colour on every row, every device,
  every day, and a row never shows a language and an area in one colour.
- **Beds and budget** are plain: they are numbers to read, not places to recognise.

### Night

The same world with the lights down: a deep navy canvas (#071423), cards one step up
(#0d1f33), hairlines #1f3a57, ink #e3ecf6, slate #9fb4cc, Signal Blue lifted to #4d94ff. The
secondary button inverts to pale ink with navy text; tag fills darken and their text lightens.
Every token has its night twin. The app is light-first.

### Named Rules

**The Two Fills Rule.** Signal Blue fills only the primary action and what is selected. Navy
fills the secondary action and your turn. Nothing else is filled with colour.

**The Ink Rule.** Every glyph is Ink Navy or Slate. Mist is never text.

**The One Colour Per Value Rule.** A fact tag's colour belongs to its value, not its row: a
language by the fixed map, an area by its hash into the areas' own palette. Two areas may share
a hue, and so may two languages; a language and an area never do, and one value never changes
hue.

**The Red Means Broken Rule.** Signal Red is for errors and destructive actions only. A waiting
guest is never red.

## Typography

**Manrope** for everything, headings and body, through `next/font` with the latin, latin-ext,
vietnamese and cyrillic subsets, so Vietnamese diacritics and Russian set cleanly at every
size. Korean, Japanese and Chinese fall back to the platform's CJK faces ("Apple SD Gothic
Neo", "Hiragino Sans", "PingFang SC", "Noto Sans CJK KR", "Noto Sans KR"), declared in
`--font-sans` (`apps/saas/app/globals.css`). IBM Plex Mono (500, tabular) is left only in the
chart tooltip's value and a numeric `Badge` (the notification bell's count).

- **Wordmark** (800, 1.5rem): "Nhịp" beside the pulse, in the sidebar and the phone's top bar
  (`Wordmark` in `packages/ui/components/logo.tsx`). The nặng dot under the i is drawn as a
  5px disc, so it reads at 1x where the font's own mark blurs into the baseline.
- **Stay Title** (800, 1.375rem, `text-stay`): the area at the top of the stay card.
- **Thread Title** (800, 1.1875rem, `text-title`): the guest's name in the thread header.
- **Panel Heading** (800, 1.125rem, -0.01em, `text-heading`): Home's panels (Leads by day,
  Waiting now, Response time) and the details' Guest and Owner. A real step over the 14px body
  under it (#327); the detector found 16px headings over 14px text before.
- **Body** (400, 1rem, 1.625): message text, `pre-wrap` so guests' line breaks survive.
- **Name** (700, 0.875rem): the guest's name on a row; "Reply" over the dock (800).
- **Note** (0.8125rem / 1.125rem, `text-note`): row previews (clamped to two lines),
  translation lines, the operator note, the pipe in the header, guest-fact labels.
- **Body Small** (0.75rem): message meta, hints.
- **Label** (600, 0.6875rem, `text-micro`): fact tags, a view tab's label, row times.
- **Field Key** (800, 0.6875rem, +0.04em, uppercase, line-height 1.45, `text-key`): MOVE-IN,
  STAY and BUDGET in the stay card's field box, and Home's funnel stages. 11px since #327 (10px
  was too small, worse with Vietnamese stacked marks: NGÂN SÁCH, THỜI GIAN Ở); the tall line
  keeps those marks clear of the field box's edge. `text-2xs` (10px) stays for the language
  marker's code and the small badge only.
- **Figure** (800, 2rem, 2.375rem from `md`, -0.03em, `text-figure-sm`/`text-figure`): Home's
  numbers, tabular, units beside them at the body size in Slate.
- **Numbers** are Manrope with `tabular-nums`: view-tab counts (700, 0.875rem), the nav count,
  times, markers and Home's figures.

## Layout

The phone and the desk are one product. Below `md` the list and the thread are full-bleed
white, one at a time; from `md` the list sits flat on the canvas and the thread is the raised
card beside it. Below `lg` the shell is the phone one: a 56px top bar with the sidebar as a
sheet. Every control tapped mid-conversation is at least 44px tall.

**Shell.** The sidebar is the marble canvas, 16rem, with a hairline on its edge: the wordmark,
the bell and the collapse toggle; then the nav; then the user. Below `lg` it is a sheet behind
a 56px top bar (menu, wordmark, the navy count, bell, user menu).

**Inbox.** From `md` the list column (`w-inbox-list`, 23.25rem) sits flat on the canvas with a
hairline on its right: the alerts panel when it shows, a manager's owner filter (or, on
Unassigned, the note that holds its row), then search and the view tabs (each carries its count; no
line under them repeats the counts, Eyal 2026-10-11), then the rows. The thread is the raised card, inset 12px. Below `md` both go full-bleed on white,
one at a time.

**The open thread (#248).** The card's header spans it; under it, the conversation with the
reply dock at its foot, always in view; beside it, the guest's details in a 300px rail
(`w-thread-rail`) behind a hairline. The rail shows from 46rem (736px) of the card's own width,
never the window's: at 1440 and 1563 with the sidebar open, and at 1366 with it collapsed; at
1366 with it open, and on a phone, the details fold into a strip under the header, and a
manager's Assign to joins the CRM status at the header's end (on a phone, both open the strip).
Beside the rail, the CRM status sits in the header after the plate, past a hairline (#314).
The conversation opens on its latest message and follows new ones while the operator is within
80px of it; scrolled up, a "New message" button takes them down.

**Home.** A `max-w-6xl` column under the page header (`PageHeader`: the title in 800 at
1.875rem from `md`, a Slate subtitle, and the window chip on the right), its panels paper on the
canvas, 12px apart (16px from `md`): the funnel strip, one row of five cells from `lg`; then
Leads by day (two thirds) beside Waiting now (one third) from `lg`; then Response time (median
on a third, buckets on two thirds, from `md`). Below `lg` Waiting now comes above the chart, and
the funnel's cells become Leads in across the top with the other four two by two.

Tap targets that matter mid-conversation are at least 44px tall (`min-h-11`), even where the
visual control is smaller. Spacing is Tailwind's 4px step.

## Elevation & Depth

The desk is flat, with one exception per screen.

- **Raised** (`shadow-raised`): the open thread's card, the one raised surface. Three
  blue-tinted layers (4/5px, 8/15px, 30/50px of Slate at 4%, 3% and 8%), never grey.
- **Dock** (`shadow-dock`): three layers cast upward (-4/5px, -8/15px, -15/30px of Slate at
  4%, 3% and 6%), under the phone's reply dock where messages scroll beneath it. From `md` the dock sits inside the raised card and is flat.
- **CTA** (`shadow-cta`): the primary button's own lift, a 14% Signal Blue glow.
- **Hairline** (`shadow-hairline`): a 1px border drawn inside, for the active nav item.
- **Overlay**: menus, popovers, selects, tooltips, dialogs, sheets and toasts keep the kit's
  soft shadow and a hairline border.

**The One Raised Surface Rule.** One surface per screen lifts: in the Inbox, the thread. A new
panel is paper on the canvas with a hairline, never a second lift. Nothing lifts on hover.

## Shapes

One base radius, `--radius: 0.5rem`, scaled: `rounded-sm` 4px (plates, fact tags, the strip's
budget frame), `rounded-md` 6px (badges, small open slots), `rounded-lg` 8px (every control:
buttons, inputs, selects, view tabs, nav items, markers, the field box), `rounded-xl` 12px
(list rows, popovers), `rounded-2xl`/`rounded-3xl` 16px (panels, cards, dialogs, the thread
card, bubbles). Bubbles keep one 4px corner, at the speaker's side. Round is for the user's
avatar, the open slot's "?" and the switch only.

## Components

### Buttons

Bold Manrope, 8px corners at every size (sm 24px, md 36px, lg 48px, icon 32px), pressing in to
0.98.

- **Primary:** Signal Blue, white text, the CTA lift; hover darkens 14%. Approve and send is
  primary `lg` with a send icon: full width on a phone (48px), 42px and its own width from `md`.
- **Secondary (default):** Ink Navy, white text. Regenerate is secondary `sm` with its icon,
  44px of target on a phone.
- **Outline:** paper with a hairline; the hairline turns ink on hover.
- **Ghost:** no fill until a 10% ink wash on hover.
- **Destructive:** Signal Red, only for the irreversible.
- **Focus:** a 2px Signal Blue ring, offset 2px.

### Turn plates

Whose turn it is (CONTEXT.md, Your turn), on a row (22px, 0.75rem) and the thread header
(30px, 0.875rem), always `data-test="thread-status"` with its `data-status`:

- **Your turn:** a filled Ink Navy plate, white bold text, a reply arrow.
- **Waiting:** a manager's view of a guest owed a reply on a thread that isn't theirs (ADR
  0022): an outlined plate (1px Mist), Slate text, a clock.
- **Sent:** bare Slate text with a check.
- **Won / Lost:** while the CRM has decided the lead (ADR 0003), the outcome stands in the
  turn's place, bare Slate like the pipe beside it, no icon: an outcome is not a turn, and Lost
  is not an error.

**The Turn Is The Signal Rule.** On a thread only the turn is filled; the pipe, the owner and
the CRM status are slate or neutral, so the turn reads from across the room.

**The Plate Says Something Rule** (Eyal, 2026-10-11, #327). A row's plate shows only when it
says something the view's tab doesn't. Under All every row keeps its plate, since All mixes every
turn. Unassigned and a manager's Waiting hide "Waiting" plates, an agent's Your turn hides "Your
turn", and Sent hides "Sent": what is left is the exception (Hà's own thread in her Waiting view,
a Won or Lost lead under Sent), and it jumps out. The thread header always shows its plate, and
the guest marker keeps its fill rule in every view (`turnTheViewSays` in `ThreadParts.tsx`).

### Guest marker

The guest's language as its ISO code (KO, EN, JA, VI, ZH, RU…), extra-bold 10px in a 28px
square with 8px corners (38px in the thread header). Filled navy for Your turn, outlined in
1.5px Mist on paper while Waiting, Pebble Strong once Sent (and when Won or Lost). Codes are
data, never translated. A thread Nhịp hasn't read yet shows a globe. Home's Waiting now keeps
an initials mark (`GuestMark`).

### Fact tags

18px squared labels (4px corners), 0.6875rem semibold, in the tag pairs: under each row's
preview, the language (its name in the interface language), the area, beds or household and
budget, when the qualification has them. A fact Nhịp doesn't have shows no tag. The row's tags
share one 18px line: a tag that doesn't fit wraps onto a hidden second line, so a tag shows
whole or not at all. In the details the language's value is its tag, wrapping when long.

### View tabs

Slots in equal columns on one line (#210): a 0.6875rem Slate label over the full count (700,
0.875rem, tabular), on paper with a hairline, 40px tall (44px below `md`), 8px corners. The view
shown is filled Signal Blue with white text. They never scroll or wrap; each holds its whole
label and count (never "99+"). A manager's Your turn is named Waiting.

### Thread row

Marker, then: the name (700) with the pipe (glyph and name, Slate) and the turn plate at the
end; a two-line preview in Note (Slate, Ink on the selected row); then the fact tags, a
manager's owner badge (never on Unassigned, #303) and the time at the end. Rows are 12px
cards inset 6px, parted by inset hairlines. Hover: 70% paper. Selected (`aria-current`): paper
with a 1px Signal Blue edge. A manager's Assign to… sits at the end of the name's line from
`md` (on hover, focus, the selected row, while open; always on touch), the plate moving left
to make room; below `md` a 44px target over the tags' line. Quiet threads fold under a
`<details>` at the list's foot.

### Thread header

The 38px marker, the name in Thread Title, the pipe, the 30px plate; beside the rail, a 1px × 20px
hairline and the CRM status (none, nor the hairline, without a CRM; Eyal, 2026-10-11, #314). At
the end, in a narrow card, the CRM status and the manager's Assign to; then the thread's actions
menu. On a phone:
back, marker, name, pipe and plate on one line (a manager's pipe as its glyph alone, to leave
room for the actions menu).

### Messages

Bubbles up to 28rem with 14px between them. A guest's: on the left, Pebble, 16px corners with
the bottom-left 4px. The office's: on the right, paper with a hairline, the bottom-right 4px.
Body text. A translation sits under a hairline inside the bubble with a languages glyph, in
Note: ink in a guest's bubble, Slate (the operator line, #242) in the office's. Over an office
bubble, who sent it ("Auto-reply" with a bolt, or "Sent from Nhịp"), `data-test="message-source"`;
under every bubble, the demo-send badge and the time.

### Reply dock

The foot of the conversation, always in view: paper, a top hairline, 14px × 24px. A first row:
"Reply" (800), the operator note ("in Korean"), and at the end the navy Regenerate. Then the
textarea, then the suggestion's operator line in Note. The last row: the polite send status in
Body Small (Slate, or Signal Red when a send failed or a pipe is disconnected), and Approve and
send. While no guest message waits, the dock folds to one 44px line: a check and "Answered ·
Sent <when> · waiting for the guest".

**The Fixed Text Box Rule.** Text boxes are a fixed height and never resize: no drag handle,
no auto-grow, they scroll on overflow. The reply box is 80px (#312, PR #313).

### Stay card (guest details)

At the top of the rail, the booking summary of what the guest wants: a pin, the area as Stay
Title, then rent or buy · beds in Slate semibold; then a field box (8px corners, hairline):
MOVE-IN and STAY side by side when both are given (#317), parted by a hairline, then BUDGET
(larger, bold) across the box under them, each a Field Key over its value. A stay length is
optional: a missing one is simply not shown. A fact the guest hasn't
given is a **dashed open slot** in the box's place, never inside its frame: 1.5px dashed Mist
on marble, 8px corners, its key, a dash (and "Not given yet" to a screen reader) and a dashed
"?" disc. Under the box the **Missing
row** (#244) names what to ask for, in the auto-reply's order and words ("budget, move-in"),
term and value in Slate, the Waiting plate's tone. Every fact is a term and its value in one
list; the area's term is for screen readers, where the pin stands for it. Nothing in the rail
opens or closes.

Below it, past a hairline, **Guest** (800): Language (its tag), Nationality, In Vietnam now,
Paperwork, as a label/value list (`grid-cols-fields`); then **Owner** (a manager's Assign to; an
agent's read-only name). The CRM status is in the header, not the rail (#314).

The **strip** (a narrow card or a phone): a marble band under the header. First the stay as
one 44px white line: pin, the area in bold, rent or buy, beds, move-in and stay in Slate, cut
with an ellipsis rather than wrapping, the budget in a 4px hairline frame (a small dashed slot
until it is given) and a Slate chevron at the end. The whole line is one target ("Show all guest
details"): its hairline turns ink on hover, and a tap opens the **details sheet** (#327). The
Missing row under it names every fact still to ask for. Then the guest facts along a line, which
on a phone also holds the CRM status and a manager's owner select. A paperwork flag there is not
its three lines of prose but a compact **paperwork chip**: Amber Note on its 12% tint, 24px, 6px
corners, a file-warning glyph and "Paperwork" in bold, with a 44px target; it opens the same
sheet, where the flag reads in full.

The **details sheet** (#327, the kit's `Sheet`, `side="bottom"`): paper rising from the foot of
the screen, 16px top corners, a hairline edge, at most 85% of the screen and scrolling past it,
clear of the home indicator; from `md` (a narrow pane on the desk) a 36rem column, centred. A
44px close at its top right, "Guest details" as its title, then every stay and guest fact whole,
exactly as the rail has them. The conversation keeps its room; the rail is unchanged.

### Home (#314, approved by Eyal 2026-10-11, `home-navy-marble-plus.html`)

Home keeps its sections, copy and numbers; the look is the inbox's.

- **Window chip:** paper, hairline, 8px, a calendar glyph in Slate and "Last 30 days" in bold
  Note.
- **Funnel strip:** the stay card's field box stretched to five stages, cells parted by
  hairlines. Each cell: its index in Slate beside the stage as a Field Key (MOVE-IN style), a
  Figure (Manrope 800, 2rem, 2.375rem from `md`, tabular; units at the body size in Slate), a
  4px navy share bar on a hairline track, and a Note hint. Closings and Lost come from the CRM
  ("As of <time>"); with no CRM, a 42px hatched box with a squared "No CRM" chip.
- **Leads by day:** bars in Mist with 2px tops, today's in Signal Blue; hairline gridlines,
  three y ticks, a date under every seventh day back from today. Today's date is bold ink, and
  that is its only mark: an empty today draws nothing. The hover cursor is the hairline track.
- **Waiting now:** Home's one raised sheet (`shadow-raised`). Its count is a navy plate
  (`Badge status="ink"`). Rows (52px, parted by inset hairlines, Pebble on hover) are the
  inbox's parts: the filled language marker, the name (700), the pipe and the language's tag,
  and the wait at the end, digits in 800 ink and units in Slate ("1 d 23 h"). In the inbox's
  order, fresh first, then Quiet: where the quiet guests start, a small "Quiet · over 48 h"
  divider (Label, Slate, a hairline running out after it), by the inbox's own split
  (`quietIds` over `buildQueueView`). An outline "Open inbox" with an arrow closes the sheet.
- **Response time:** the median as a Figure with "median" beside it; under it, "9 in 10
  answered within 2 h · 21 leads answered" (Note, 600; the p90 of ADR 0002, in plain words),
  then the hint. Four bucket rows: label, a 10px bar on the hairline track (Under 5 min in
  Signal Blue, the rest Signal Blue at the soft strength, #a9cbff), the count in 800 ink and its
  share in Slate.

**The Two Strengths Rule.** A chart is one colour at two strengths on a hairline track: Signal
Blue for the value to read first, its soft strength (or Mist, for the day bars) for the rest.

### Navigation

40px items (44px below `lg`), 8px corners, semibold ink with 18px icons. Active: paper with a
hairline, bold. Hover: paper. No heading over the items. Coming soon items (Paperwork, CRM)
are disabled, "Coming soon" in plain Slate at their end. The Inbox item's Your-turn count is bold ink at its end; collapsed, a navy
corner count (`Badge status="ink" size="corner"`). The bell's unread count is Signal Blue.

### Inputs

36px, a hairline stroke on paper, 8px corners, Signal Blue stroke and ring on focus, a Signal
Blue caret, Slate placeholder. Search (`variant="search"`): 36px (44px below `md`), 14px text,
room for its icon at 12px. While it holds text, an X in Slate at its right end clears it (ink on
hover; the field's own height as its target, 44px below `md`; the cursor stays in the field); the
browser's own cancel button never shows.

### Badges

`Badge` stays the one status mark outside the turn: squared (6px), 20px, Label type. Neutral is
Slate on Pebble; info Signal Blue on its tint; success, warning and error their colour on a 12%
tint; `primary` solid Signal Blue (the bell); `ink` solid navy (the collapsed nav count, the
phone top bar's count).

The **CRM status** is not a badge: it reads as the pipe beside it does, a glyph (a person with a
check, or with a cross while not in the CRM yet) and its words in Slate Note semibold, never
filled. Where the CRM has a web app, "In CRM" is a link with a small external-link glyph and
ink on hover.

## Do's and Don'ts

### Do:

- **Do** keep every glyph Ink Navy (#0b3558) or Slate (#476788).
- **Do** fill with Signal Blue (#006bff) only the primary action and what is selected.
- **Do** raise exactly one surface per screen, with `shadow-raised`.
- **Do** mark the turn with the plates: navy filled, outlined with a clock, bare with a check.
- **Do** mark a guest by their language code, filled, outlined or muted by the turn.
- **Do** keep a value's tag colour fixed: languages by the map, areas by the hash
  (`fact-tags.ts`).
- **Do** show a fact the guest hasn't given as a dashed open slot, and name it in the Missing row.
- **Do** use 8px corners on controls and 16px on panels.
- **Do** keep tappable controls at least 44px tall in the inbox and the phone shell.
- **Do** use theme tokens and utilities (`text-note`, `text-title`, `text-stay`, `border-mark`,
  `border-open`, `shadow-raised`, `w-thread-rail`); `@shadcn/lint` rejects raw colours,
  arbitrary values and inline styles in the app.
- **Do** give every new colour a night twin in `.dark`.
- **Do** keep text boxes a fixed height with no resize handle (#312).
- **Do** draw a chart in one colour at two strengths on a hairline track.
- **Do** let a row's plate say only what its view's tab doesn't (#327).

### Don't:

- **Don't** use Mist (#a6bbd1) for text.
- **Don't** put Signal Blue on a fact tag, a plate or anything decorative.
- **Don't** lift a second surface, or anything on hover.
- **Don't** use red for a waiting or overdue lead.
- **Don't** colour a tag by its row or position; colour belongs to the value.
- **Don't** let a text box grow or show a drag handle.
- **Don't** spend three lines of a phone strip on prose; a chip opens the sheet.
- **Don't** use grey borders or grey shadows; both are blue-tinted.
- **Don't** make a status into a button, or a button into a status.
- **Don't** restyle a `@repo/ui` component with `className` beyond layout; add a variant.
- **Don't** write arbitrary Tailwind values in app code; name the value as a token in
  `apps/saas/app/globals.css`.
