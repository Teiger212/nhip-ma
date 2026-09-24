# Changelog

## 2026-09-24 (operators end with their office)

### Changed

#### No office, no account (ADR 0013)

- When an operator's membership ends (the office is deleted, they are removed, or they leave), their account is deleted with its sessions, credentials and sent invitations. The platform admin keeps theirs.
- Deleting any account cancels its subscriptions, whichever path deletes it (self, admin, or the above); the kit did this on self-delete only.
- `Answer.operatorName` keeps the sender's name at approval, so a reply still says who sent it after the account is gone. `pnpm seed` fills it on existing Answers.

## 2026-09-20 (send contract)

### Changed

#### The Answer is the record of a send (ADR 0011)

- `Approval`, `Send` and `Message.claimedAt` fold into one `Answer` table: one row per guest message answered, written in status `sending` before the vendor is called, then `sent`, `failed` or `unknown`. Old files migrate on open.
- Approve names its target: the request carries `inboundId` and `reply`; `409 stale_target` when the guest wrote again, `400 inbound_required` and `400 empty_reply` otherwise. The reply box keys edits by the guest message, so a new message empties it.
- A vendor refusal or missing credentials is `failed` and may be approved again; a network failure, or a vendor success the app could not record, is `unknown` and refused with `409 delivery_unknown` until reconciled. Nothing is ever sent twice for one guest message.
- "Your turn" is derived from Answers, not message order: a guest message arriving mid-send stays in the queue.
- The guest's profile name is escaped in the follow-up prompt like the messages are (audit finding 7).
- `Conversation.lastSend` becomes `answers` and `lastAnswer`.

## 2026-09-20

### Added

#### Office tenancy and the Home screen (ADRs 0001, 0002, 0008)

- **The office is the tenant.** `Conversation.ownerUserId` becomes `officeId`, the kit organization's id. The store lists and reads strictly by office, and the "unowned is visible to everyone" fallback is gone. Files from before tenancy migrate on open (the column is dropped) and their threads wait unowned until `adoptUnownedThreads` runs; the seed does that for the walk office.
- **Session gate resolves the office.** `requireInboxSession` returns `{ userId, officeId }`: the session's active organization, else the first membership, else `403 no_office`. `POST /dev/inbound` needs a session and files under that office.
- **Pipe-to-office mapping.** `PipeConnection` (pipe + vendor id of the number or OA → office) replaces `INBOX_OWNER_USER_ID`. Webhook events carry `pipeExternalId` (WhatsApp `phone_number_id`, Zalo OA id) and are filed under the office that owns it; inbound on an unconnected pipe is dropped with a log line. `pnpm --filter saas pipe:connect` sets a mapping.
- **Walk office.** `pnpm seed` creates organization `walk-office` with the walk user as owner and active organization, and files the invented threads under it.
- **Home.** `/home` is enabled in the sidebar: the five funnel stages as cards, closings and lost showing "Connect your CRM", the rest and response time marked as coming next. No number on the screen looks like a fact yet.
- **Office assignment (ADR 0010).** The gate reads the operator's memberships on every request and never the session's active organization (a client-writable field); none is `403 no_office`, more than one `403 ambiguous_office`. Thread identity is (office, pipe, guest) with a unique index on the triple, so the same guest at two offices is two threads. Each message records the office endpoint it travelled through; a live send is refused with `409 pipe_not_configured` when the thread's number is not the one the credentials belong to (`ZALO_OA_ID` names the Zalo OA). Public sign-up is closed, operators cannot create organizations, and accepting a second office's invitation is refused. The seed adds `admin@nhip.local` (platform admin, owner of the walk office), and the sidebar shows **Admin** to platform admins.
- GPT-6-Astra architecture audit recorded in `reports/2026-09-20-gpt6-astra-architecture-audit.md`; its tenancy findings are addressed here, the send-contract findings go to the next PR.

## 2026-09-18

### Added

#### The conversation loop (ADR 0009: ADRs 0004, 0005, 0006, 0007)

- **Reply-only per-message approval.** `Approval` and `Send` record the guest message they answer (`answersMessageId`); the unique index moves from `Send.conversationId` to `Send.answersMessageId`, and the atomic claim moves from the thread to the inbound message (`Message.claimedAt`). `Conversation.sentAt` is the last office send and no longer terminal. Existing SQLite files migrate on open, and old sends are backfilled with the inbound they answered.
- **Your turn.** The queue's pending state is `Conversation.unansweredInboundId` (the guest spoke last). Views are `yourTurn`, `sent`, `all`. Threads the guest last touched more than 48 hours ago sit in a collapsed **Quiet** section at the bottom of Your turn. A second approve with no new inbound is `409 already_answered`.
- **Guest message translation.** Every guest message is translated into EN and VI at ingest, in the background, through the draft adapter, stored per message per operator language, and shown under the original. `GET /api/conversations?locale=` backfills missing translations.
- **AI follow-up drafts.** When a guest writes back after a send, the follow-up template appears at once and a model draft from the whole conversation replaces it when it lands. The reply box shows where the suggestion came from and has **Regenerate** (`POST /api/conversations/[id]/draft`). A post-check drops any draft that touches paperwork or ownership. The first reply keeps the template.
- **Draft adapter, vendor-neutral.** `DRAFT_API_KEY` + `DRAFT_MODEL` enable an OpenAI-compatible chat-completions client (`DRAFT_BASE_URL` defaults to OpenRouter; any vendor or a local Ollama is a config change, no SDK). A key without a model is a startup error. Unset means no translation and template drafts. Nothing in this path sends.
- The inbox client polls every 10 seconds. `CribLanguage` is renamed `OperatorLanguage` (CONTEXT.md).

## 2026-09-06

### Changed

#### Inbox walk UI (apps/saas, packages/ui, tooling/tailwind)

- Visual upgrade of the walk inbox (list, detail, sticky approve bar) and shared chrome (`NavBar`, `UserMenu`, `WalkLocaleToggle`). Routes, nav labels, the en+vi language control, and disabled Home / International are unchanged.
- The sidebar rail only collapses on click and uses a pointer cursor (no `w-resize` / `e-resize`). The mobile header shows the full **Nhịp** wordmark next to the logo, untruncated.
- The theme FOUC script no longer renders inside a client React tree. `@repo/ui` `ThemeProvider` / `useTheme` wrap `@teispace/next-themes`; layouts inject `getThemeScript()` in `<head>` with `noScript` so React 19 does not warn about `next-themes`' inline `<script>`. The light/dark/system toggle API is unchanged.
- The color mode toggle uses `cursor-pointer` / `resize-none` on the pill and every system/light/dark button, like the walk language toggle. The user-menu color-mode row is `cursor-default resize-none` so the sidebar rail cannot show a resize cursor between light and dark.
- Root docs are product-first: `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, and `HANDOFF.md`. Locale-prefixed inbox routes stay the rule; `AGENTS.md` stays the agent entry.
- The SaaS type stack is Be Vietnam Pro + IBM Plex Mono (Vietnamese-capable, not Inter). Olive tokens stay one green family, with `--touch` the single accent. Buttons keep the kit pill rule; inbox rows stay square; panels use the 8px radius.
- Thread rows use squircle initials, tabular timestamps, and compact status flags. Extract / crib / reply use hairline sections instead of generic cards. Loading uses list-shaped skeletons; load errors offer **Try again**.
- The sidebar wordmark is `inbox.brand` (Nhịp), not Acme.
- Inbox search is `h-12` with more padding. The desktop thread list is a locked `22rem` column (`flex: 0 0 22rem`) so long detail content cannot change its width.
- Walk-visible `inbox.*` and operator menu copy: EN chips use sentence case (`Needs approval`, `Sent`, `Demo send`). Crib is **Operator note**. VI is full Vietnamese (no Draft / inbound / interviewer leftovers; user menu is Cài đặt tài khoản / Giao diện / Đăng xuất).
- The sticky detail bar is **Approve and send** plus **Edit reply**. Idle **Not sent** stays an accessible live region but is visually hidden, so it does not look like a second button. Progress, errors, and **Sent {at}** stay muted under the row. Edit reply scrolls `#inbox-reply` into view and focuses it.
- SaaS uses next-intl locale prefixes (`/en/inbox`, `/vi/inbox`) with `defineRouting`, `createNavigation`, and `proxy.ts`. Cookie-only locale (no path prefix) is rejected for this walk. Bare `/inbox` and `/` go to a prefixed inbox. The walk language toggle navigates `/en/inbox` ↔ `/vi/inbox`. Walk bypass lands on `/{locale}/inbox`.
- `NextIntlClientProvider` receives `locale` on the `[locale]` layout so extract labels follow EN↔VI. English rent/buy values are **Rent** / **Buy** (not raw codes). Extract fields remount with `useLocale()`.

### Added

#### Walk / tunnel (apps/saas)

- `allowedDevOrigins: ["*.trycloudflare.com"]` so Cloudflare quick tunnels can load `/_next/*` during `next dev`.
- Optional local/tunnel walk flag `WALK_BYPASS_AUTH=1` (off by default, commented in `.env.local.example`) signs in the invented `walk@nhip.local` demo session at `GET /api/walk-bypass` and redirects to `NEXT_PUBLIC_SAAS_URL` + `/inbox`. It refuses in `NODE_ENV=production`; it is not an open door or “no login”. Inbox stays invented threads + mock send, and Better Auth stays enabled.

### Changed

#### Walk language (apps/saas)

- Walk chrome language lives in the Walk Operator **User menu**, directly under **Account settings**, as **Language** / **Ngôn ngữ** with **EN** / **VI** toggles only. Kit `de` / `es` / `fr` stay in `@repo/i18n` config but are not offered in the walk selector. The sidebar Account settings submenu drops Language. Login still uses the kit `LocaleSwitch`, and choosing a language still writes `NEXT_LOCALE` and refreshes.

#### Walk nav placeholders (apps/saas)

- **Start** is labeled **Home** / **Trang chủ** and stays in the sidebar as a disabled placeholder (`aria-disabled`, not clickable).
- **AI Chatbot** is labeled **International** / **Quốc tế** and stays as a disabled placeholder. Inbox remains the only working nav job; Account settings stays.

#### Inbox chrome experiment (apps/saas, packages/ui)

- Reversible look-only branch: kit `AppWrapper` / `NavBar` compose shadcn-style `Sidebar*` primitives from `@repo/ui` (provider, header/content/footer, grouped menus, icon collapse, mobile sheet). Inbox stays the only working job. Nav furniture is Home (disabled), Inbox, International (disabled), and Account settings.
- Sidebar tokens use a cooler sage palette (`--sidebar*`) so chrome reads differently from the olive page tokens. Landed on `main` with beautify and product-first docs in PR #8.

## 2026-09-05

### Changed

#### Inbox (apps/saas)

- Inbox is a first-class authenticated account route at `/inbox` (`(account)/inbox`, like chatbot), using kit `AppWrapper` / `NavBar` (mobile hamburger Sheet, desktop collapsible sidebar). The custom `InboxShell` rail is gone.
- `/` redirects to `/inbox`. Unauthenticated visits hit kit login; `redirectAfterSignIn` is `/inbox`. `pnpm seed` still writes invented threads to `data/nhip.db` and adds walk login `walk@nhip.local` / `walkthrough` when `DATABASE_URL` is Postgres. Organizations are not required; kit `hideOrganization` keeps the org switcher / create-org out of NavBar. Reports, International, billing, and orgs are not product features.
- Walk language sits in the Walk Operator user menu under Account settings (**EN** / **VI** only). Inbox list/detail no longer duplicate the Language control.
- Below Tailwind `md`, the inbox shows either the thread list or the selected thread. Detail opens from a list row and returns with an in-app **Back** control; the detail header shows the guest name. Desktop two-pane layout is unchanged.
- **Approve and send** (full label) and send status pin to a sticky detail bar, so the operator does not scroll past extract, crib, and reply. Reply stays editable above. One send path.
- Extract keeps the nine-field model, lists filled facts first, and collapses `(missing)` / `none mentioned` rows. Mentioned paperwork stays visible.
- Message and `sentAt` display use localized relative or local datetime. Storage stays ISO.
- Send status uses `role="status"` with `aria-live="polite"` and `aria-atomic="true"`.
- **For you** is omitted when there is no one-shot crib; empty extracts use `inbox.crib.emptyFacts`.
- Search sits in a full-width chrome row above the thread list and conversation pane (the width of list + detail, not the left shell nav).
- Kit `NavBar` adds **Inbox** as the live account job next to existing kit items. Reports and International are not shipped as nav.
- Inbox UI strings live under `inbox.*` in `packages/i18n/translations/{en,de,es,fr,vi}/saas.json`. Vietnamese is registered as BCP-47 `vi` in `packages/i18n/config.ts`. The **Language** / **Ngôn ngữ** control writes the kit `NEXT_LOCALE` cookie via `updateLocale`. Unknown codes such as `vn` fall back to English.
- **For you** crib body is formatted at read time from `inbox.crib` templates (not the seeded English-only string). Guest **Reply** stays in the guest's language. Inbox UI uses `useTranslations("inbox")` plus nested keys (`crib.body`, `fields.*`) so next-intl does not throw `MISSING_MESSAGE` for `inbox.crib`. Message JSON is imported statically from `@repo/i18n`.
- Vietnamese list states `inbox.loading` (`Đang tải cuộc hội thoại…`) and `inbox.loadError` (`Không tải được cuộc hội thoại.`) match the English keys.

### Fixed

#### Inbox (apps/saas)

- **Approve and send** refuses a second send on a thread that already has `sentAt` (`409 already_sent`). The button is disabled after a mock send, so a double tap cannot transmit twice.
- Inbox list shows a loading and load-error state instead of a false “No conversations.” when `/api/conversations` is still in flight or fails.
- Seed output reports fresh writes vs skipped existing IDs. Docs and `.env.local.example` state the repo-root SQLite path and that `SEND_MODE` is mock unless exactly `live`.

## 2026-08-30

### Added

#### Inbox (apps/saas)

- Ported the Nhịp inbox into `apps/saas`: thread list search, layman extract, **For you** (crib, not sent to the guest) above **Reply**, paperwork flag, **Approve and send** (mock). The default URL is the inbox on port **3010**. Auth is bypassed for the local walkthrough. `pnpm seed` seeds four invented threads (Minji, Yuki, Alexei, Thảo).
- New Prisma / Drizzle models in `packages/database`: `Pipe`, `Conversation`, `Message`, `Qualification`, `Draft`, `Paperwork`, `Approval`, `Send`. The walkthrough uses SQLite (`file:./data/nhip.db`). Inbox rows are not stored on User / Org / Plan / Subscription.

## 2026-08-18

### Changed

#### Dependencies

- **Production dependencies**: Bumped `es-toolkit` to `^1.51.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-17

### Changed

#### UI

- **Toasts now use Base UI**: `packages/ui/components/toast.tsx` is rebuilt on `@base-ui/react/toast` (after the shadcn Base UI toast) and `sonner` is removed from the workspace. The `toastSuccess`, `toastError`, `toastInfo`, `toastWarning`, `toastLoading`, `toastPromise` and `dismiss` helpers are gone; use the exported `toast` manager (`toast.add({ title, description, type: "success" })`, `toast.close(id)`, `toast.promise(promise, { loading: { title }, success: { title }, error: { title } })`). `Toaster` still accepts `position` and takes a translated `closeLabel` for the dismiss button (`common.aria.closeToast`); the toast primitives (`Toast`, `ToastContent`, `ToastTitle`, `ToastDescription`, `ToastAction`, `ToastClose`, `ToastViewport`, ...) are exported for custom toasts. Run `pnpm install` after pulling.

#### Dependencies

- **Production dependencies**: Bumped `@hookform/resolvers` to `^5.9.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-16

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.66`, `@ai-sdk/openai` to `^4.0.42`, `@ai-sdk/react` to `^4.0.69`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1111.0`, `better-auth` and `@better-auth/passkey` to `1.6.29`, and `prisma-zod-generator` to `3.3.0`. **Development dependencies**: Bumped `turbo` to `^2.10.10`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-15

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.65`, `@ai-sdk/react` to `^4.0.68`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1110.0`, `@hookform/resolvers` to `^5.8.0`, `@next/third-parties` and `next` to `16.3.1`, `better-auth` and `@better-auth/passkey` to `1.6.28`, `fumadocs-core` and `fumadocs-ui` to `16.14.4`, `hono` to `^4.13.2`, `dodopayments` to `^2.46.0`, and `resend` to `^6.20.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-14

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.64`, `@ai-sdk/openai` to `^4.0.41`, `@ai-sdk/react` to `^4.0.67`, and `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1109.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-13

### Changed

#### Page titles

- **Document title**: Marketing and SaaS use `{page} – {appName}` (en dash) instead of a pipe. Every SaaS page sets a title, so tabs read like `Welcome back – supastarter for Next.js Demo` rather than the product name alone.
- **Blog list**: The tab title and page-header eyebrow say `Blog`; the H1 stays `Notes from the product`.
- **Hero preview**: The dashboard mock’s drop shadow is no longer clipped at the bottom. The section drops `overflow-x-hidden` around the preview, and the mock has enough bottom padding for the full blur.

#### UI

- **Mail templates**: The shared mail wrapper is wider (640px) with more padding and 16px body copy, so transactional emails are less cramped. The primary button matches that scale.
- **Form controls**: Inputs, selects, and textareas use `rounded-xl` to sit closer to the pill buttons and other rounder surfaces.
- **Alerts**: Feedback alerts use `rounded-xl` to match the form controls. Success, error, and warning use Tailwind `green-800`/`green-400`, `red-700`/`red-400`, and `yellow-700`/`yellow-500` instead of custom oklch values.
- **Logo**: The middle bar of the shared Acme mark uses the chromatic olive touch color.
- **App icon**: Replaced the rocket `icon.png` in marketing, SaaS, and docs with the three-bar Acme mark, whose middle bar uses the chromatic olive touch color.
- **SaaS touch color**: The chromatic olive marks state in the product: active nav icons, settings/tab underlines, checked switches, unread notification badges, active/recommended plans, the chat send control, and organization logo placeholders.
- **Marketing type scale**: Replaced one-off font sizes (`text-[2.5rem]`, `text-[11px]`, and similar) with the nearest Tailwind tokens to keep marketing type on the shared scale.
- **Docs typography**: The docs app uses the marketing pairing—Inter for body copy and DM Sans for headings and the wordmark.
- **Accordion**: FAQ panels animate height with `--accordion-panel-height` and a longer ease, so open/close no longer snaps.
- **Locale switch**: Moved the duplicated marketing/SaaS language pickers into `@repo/ui`. Apps pass locales, the current value, and a persist callback, keeping the UI package free of `@repo/i18n`.
- **Feature headlines**: Product feature spreads drop the icon above the top-level title; the three-up benefit grid keeps it.
- **Inner pages**: Blog, changelog, and contact use the homepage’s left-aligned header (olive eyebrow, stacked title and lede). Changelog is a dated timeline with six example releases; the journal has product-shaped sample posts.
- **Marketing container**: The marketing `container` max-width steps down from `7xl` to `6xl`, narrowing the public pages.
- **SaaS logo**: The authenticated app and auth screens show only the three-bar mark, without the Acme wordmark.
- **Blog covers**: Each sample journal post has a product-frame cover, shown left of the title at full container width in the list; the article page already used the same `image` field.
- **Blog tags**: The journal list filters with `?tag=`. Tags on the list and article pages are links; the active tag (or All) clears the query.
- **Hero grid**: Removed the faint grid overlay from the marketing hero.
- **Trial copy**: FAQ and the billing journal post say 7-day trials, matching `trialPeriodDays` in the payments config.
- **Hero highlights**: Removed the Authentication / Organizations / Billing row under the homepage preview.
- **Headline wrapping**: Left-aligned headlines and subtitles use `text-pretty` so the last line rarely leaves a single word hanging. Centered headings keep `text-balance`.
- **Homepage sections**: Tighter vertical padding brings features, testimonials, pricing, FAQ, and the CTA closer together.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.62`, `@ai-sdk/openai` to `^4.0.40`, `@ai-sdk/react` to `^4.0.65`, `better-auth` and `@better-auth/passkey` to `1.6.27`, and `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1108.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-08-12

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.59`, `@ai-sdk/openai` to `^4.0.37`, `@ai-sdk/react` to `^4.0.62`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1107.0`, `next-intl` to `4.13.6`, `use-intl` to `^4.13.6`, `resend` to `^6.19.0`, and `stripe` to `^22.5.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.4.3`, `oxlint` to `^1.78.0`, and `oxfmt` to `^0.63.0`.

---

## 2026-08-11

### Changed

#### Marketing redesign

- **Typography**: Marketing uses Inter for body copy and DM Sans for headlines (including the wordmark), with `text-balance` only on centered headlines and subtitles. The SaaS app uses Inter throughout.
- **Color scheme**: Shared tokens sit on Tailwind’s olive scale—warm olive-50 paper, olive-tinted borders, and olive-950 actions—giving the high-contrast ink look a quiet color in the Oatmeal olive theme’s family.
- **Marketing visual language**: Moved the public site toward a quieter Linear/Notion-like layout with UserJot-inspired structure—more vertical air, a left-aligned hero, stacked section titles with the lede underneath, a single bordered pricing table, and shared medium-weight page headers across blog, changelog, contact, and legal pages. A chromatic olive-green touch color plays the role of UserJot’s orange: a “New” pill, section labels, larger unboxed icons, checks, and secondary links. The faint hero grid stays; scroll reveals and hero fade-ins are gone.
- **Landing sections**: Added testimonials and a closing CTA band to the marketing homepage, richer example copy across marketing locales, and clearer shared pricing descriptions.
- **Visual polish**: The hero uses a live dashboard wireframe (sidebar, stats, placeholder) instead of screenshots, feature placeholders are CSS product frames with dummy portraits and plan icons, testimonials include example headshots, pricing leads with the amount, and the newsletter is a compact closer instead of a second CTA.
- **Logo**: Replaced the layered hex SVG with a stacked three-bar Acme mark (thin rounded bars forming a pyramid) and a semibold wordmark in the shared `Logo` component.
- **Color mode toggle**: Moved the duplicated marketing/SaaS pickers into `@repo/ui`. Apps pass translated labels as props, keeping the UI package free of `@repo/i18n`. The active option drops its drop shadow.

#### Dependencies

- **Production dependencies**: Bumped `lucide-react` to `^1.31.0`, `react-dropzone` to `^20.1.0`, and `sonner` to `^2.0.8`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.14.3`, `fumadocs-mdx` to `15.2.3`, and `tsx` to `^4.23.12`.

---

## 2026-08-10

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@orpc/*` to `1.15.0`, `pg` to `^8.23.0`, and `@tanstack/react-table` to `^9.1.2`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-08-09

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.58`, `@ai-sdk/openai` to `^4.0.36`, `@ai-sdk/react` to `^4.0.61`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1106.0`, `@tanstack/react-table` to `^9.1.0`, `dodopayments` to `^2.45.1`, `hono` to `^4.13.1`, `lucide-react` to `^1.30.0`, `nodemailer` to `^9.0.5`, `react-email` to `^6.9.2`, and `react-hook-form` to `^7.85.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.14.2`, `@types/node` to `26.2.0`, `tsx` to `^4.23.11`, and `turbo` to `^2.10.9`.

---

## 2026-08-08

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.56`, `@ai-sdk/openai` to `^4.0.34`, `@ai-sdk/react` to `^4.0.59`, `@orpc/*` to `1.14.15`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1105.0`, and `lucide-react` to `^1.29.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.14.1`, `postcss` to `8.5.26`, `tsx` to `^4.23.9`, and `typescript` to `7.0.2` (major upgrade: enabled `experimental.useTypeScriptCli` in Next.js app configs because TypeScript 7 drops the JavaScript compiler API). `@repo/logs` imports `createConsola` from `consola/core` for TypeScript 7's stricter module resolution.

---

## 2026-08-07

### Fixed

#### Auth

- **Social sign-in errors**: Failed OAuth/social sign-in API calls on the login and signup pages show an error toast instead of failing silently.

#### Admin

- **User list after delete**: Removing a user invalidates the admin users query, so the deleted row leaves the list without a manual refresh.
- **Organization list caches**: Admin organization create/update/delete also invalidates the user organization switcher list.

#### Organizations

- **Leave organization**: Removing a member (including leave) refreshes both the members query and the switcher's organization list.

#### Settings

- **Active sessions after password change**: Changing a password with `revokeOtherSessions` invalidates the active sessions list.

#### Organizations

- **Invitation accept button**: The organization invitation modal's Accept action uses the primary button variant, setting it apart from Decline.

#### Permissions

- **Admin layout Permix race**: The nested admin layout no longer calls `permix.check` before the authenticated layout may have finished `setup()`; it uses `checkPermission` for the user-scoped `admin.access` gate instead.

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.54`, `@ai-sdk/openai` to `^4.0.31`, `@ai-sdk/react` to `^4.0.57`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1104.0`, `dodopayments` to `^2.45.0`, and `nuqs` to `^2.9.5`. Skipped `typescript` `7.x` (Next.js 16.3.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `tsx` to `^4.23.8`.

---

## 2026-08-06

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.52`, `@ai-sdk/openai` to `^4.0.30`, `@ai-sdk/react` to `^4.0.55`, `better-auth` and `@better-auth/passkey` to `1.6.26`, `next-intl` and `use-intl` to `4.13.5`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1103.0`, `@base-ui/react` to `^1.7.0`, `nodemailer` to `^9.0.4`, and `@tanstack/react-table` to `^9.0.0` (table components migrated to `useTable` with explicit `tableFeatures`). Skipped `typescript` `7.x` (Next.js 16.3.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.4.2` and `tsx` to `^4.23.6`.

---

## 2026-08-05

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.50`, `@ai-sdk/openai` to `^4.0.28`, `@ai-sdk/react` to `^4.0.53`, `@orpc/*` to `1.14.14`, `nanoid` to `^6.0.1`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1102.0`, `hono` to `^4.13.0`, `next` to `^16.3.0`, and `@next/third-parties` to `16.3.0`. Removed the deprecated `@types/uuid` stub (`uuid` ships its own TypeScript definitions). Skipped `typescript` `7.x` (Next.js 16.3.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.77.0` and `oxfmt` to `^0.62.0`.

---

## 2026-08-04

### Added

#### Admin

- **User bans**: Admin controls to ban users with an internal reason and optional expiration, review active ban details, and unban users.

#### Developer tooling

- **Agent skills**: Repository-scoped agent skills for common feature, auth, payments, database, docs, testing, and verification workflows.

#### Permissions

- **Permix authorization**: Introduced `@repo/permissions` with a typed permission matrix and `createPermissionRules` / `checkPermission` helpers. Permix is wired into oRPC (`permix/orpc`) for `adminProcedure` and organization/payment gates, and into the SaaS app via `permix/next` (server setup + dehydrate) and a client `PermixProvider` per the official Next.js integration (`setup` early, `dehydrate` → `PermixHydrate`, client `setup` for `isReady`, nested `setup` only when org context changes). UI guards use `permix.check` / `usePermissions().check` instead of scattered role string comparisons; `isOrganizationAdmin` / `isOrganizationOwner` remain as thin wrappers. Better Auth `organization.*` client endpoints stay on Better Auth's own access control. oRPC `protectedProcedure` sets user-scoped rules only (no per-request active-org membership fetch); org-scoped API checks resolve membership for the target organization. `checkPermission` reads the boolean matrix directly rather than constructing a Permix instance per call.

### Changed

#### Dependencies

- **Production dependencies**: Added `permix` `^4.1.2`. Bumped `@hookform/resolvers` to `^5.7.1`, `hono` to `^4.12.34`, and `react-dropzone` to `^20.0.0` (major upgrade: Node.js 22+ required, ESM-first package layout). Synced the lockfile for `fumadocs-mdx` `15.2.2`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `tsx` to `^4.23.5`.

---

## 2026-08-03

### Fixed

#### Auth

- **Login tab order**: Moved the forgot-password link so keyboard navigation goes from the password field to the password visibility toggle before leaving the field group.

#### UI

- **Base UI migration follow-ups**: Repaired button `render` composition, dropdown link grouping, select popup sizing, and destructive confirmation styling after the Base UI migration.

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.48`, `@ai-sdk/react` to `^4.0.51`, `@hookform/resolvers` to `^5.6.0`, and `react-dropzone` to `^19.2.0`. Synced the lockfile to the catalog, including prior bumps for `ai` `^7.0.47`, `@ai-sdk/openai` `^4.0.27`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` `3.1101.0`, `dodopayments` `^2.44.0`, `hono` `^4.12.33`, `nuqs` `^2.9.4`, and `react-hook-form` `^7.84.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `start-server-and-test` to `^3.0.12`. Synced the lockfile, including prior bumps for `@shikijs/rehype` `^4.4.1`, `prisma-zod-generator` `3.1.0`, and `turbo` `^2.10.8`.

---

## 2026-08-02

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.47`, `@ai-sdk/openai` to `^4.0.27`, `@ai-sdk/react` to `^4.0.50`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1101.0`, `dodopayments` to `^2.44.0`, `hono` to `^4.12.33`, `nuqs` to `^2.9.4`, and `react-hook-form` to `^7.84.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.4.1`, `prisma-zod-generator` to `3.1.0`, and `turbo` to `^2.10.8`.

---

## 2026-07-31

### Fixed

- **Auth redirects**: Login, signup, OTP, and onboarding redirects are restricted to normalized root-relative SaaS paths, so untrusted `redirectTo` values cannot send users to external sites.
- **SaaS indexing**: Added app-wide `noindex, nofollow` robots metadata to keep authentication and protected SaaS pages out of search results.

### Changed

#### Headless UI library: Radix UI → Base UI

- **Breaking**: `packages/ui` builds on `@base-ui/react` instead of `radix-ui`, matching the TanStack Start version. Composition uses Base UI's `render` prop; the Radix `asChild` prop is removed from all components (no compatibility shim).
  - `<Button asChild><Link href="/" /></Button>` becomes `<Button render={(props) => <Link {...props} href="/" />} />`.
  - `<DropdownMenuTrigger asChild><Button /></DropdownMenuTrigger>` becomes `<DropdownMenuTrigger render={<Button />} />`.
  - `DropdownMenuItem` rendering a link needs `nativeButton={false}` alongside `render`.
- **State attributes**: Base UI `data-[open]`, `data-[closed]`, `data-[checked]`, `data-[starting-style]`, and `data-[ending-style]` replace Radix `data-[state=open|closed|checked]` variants. Update custom styles that target the old attributes.
- **CSS variables**: `--radix-accordion-content-height` → `--collapsible-panel-height`, `--radix-dropdown-menu-trigger-width` → `--anchor-width`.
- **Component API deltas**: `Tabs` uses `Tab`/`Panel` instead of `Trigger`/`Content`, `Accordion` takes `multiple`/`defaultValue` instead of `type`/`collapsible`, `TooltipProvider` takes `delay` instead of `delayDuration`, `DropdownMenuItem` uses `closeOnClick={false}` instead of `onSelect` + `preventDefault`, and `Select` accepts an `items` prop so `SelectValue` renders labels instead of raw values.
- **Dependencies**: Removed `radix-ui`; added `@base-ui/react` to the workspace catalog and `@repo/ui`.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.42`, `@ai-sdk/openai` to `^4.0.24`, `@ai-sdk/react` to `^4.0.45`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1098.0`, `nuqs` to `^2.9.3`, `postcss` to `8.5.25`, and `stripe` to `^22.4.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-30

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.41`, `@ai-sdk/openai` to `^4.0.23`, `@ai-sdk/react` to `^4.0.44`, `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/tanstack-query`, and `@orpc/zod` to `1.14.13`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1097.0`, and `postcss` to `8.5.24`. Synced the lockfile to the catalog, including prior bumps for `@prisma/adapter-pg`, `@prisma/client`, `@prisma/nextjs-monorepo-workaround-plugin`, and `prisma` `7.9.1`, and `fumadocs-core` / `fumadocs-ui` `16.13.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `resend` to `^6.18.1` in `@repo/mail`.

---

## 2026-07-29

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.40`, `@ai-sdk/openai` to `^4.0.22`, `@ai-sdk/react` to `^4.0.43`, `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/tanstack-query`, and `@orpc/zod` to `1.14.12`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1096.0`, `@prisma/adapter-pg`, `@prisma/client`, `@prisma/nextjs-monorepo-workaround-plugin`, and `prisma` to `7.9.1`, and `fumadocs-core` / `fumadocs-ui` to `16.13.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@types/node` to `26.1.2`, `oxlint` to `^1.76.0`, and `oxfmt` to `^0.61.0`.

---

## 2026-07-28

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/tanstack-query`, and `@orpc/zod` to `1.14.10`, and `@hookform/resolvers` to `^5.5.7`. Upgraded `prisma-zod-generator` to `3.0.1` (major) and regenerated Prisma Zod schemas. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `turbo` to `^2.10.7`.

---

## 2026-07-27

### Fixed

#### API

- **Organization billing authorization**: Listing purchases requires organization membership, and creating organization checkout sessions requires an owner or administrator role. Inaccessible customer portal purchases return `NOT_FOUND` to prevent resource enumeration.
- **Payment redirects**: Restrict checkout and customer portal return URLs to the configured SaaS application origin.
- **AI message validation**: Validate incoming UI messages with the AI SDK before converting them or invoking the model.

### Changed

#### API

- **Response contracts**: Added explicit, co-located Zod output schemas to every oRPC procedure and removed redundant notification response remapping.

#### SaaS app

- **Organization role select**: Removed secondary role descriptions and their unused translation keys from the organization role select, which shows only compact role names.

#### Dependencies

- **Production dependencies**: Bumped `@ai-sdk/anthropic` to `^4.0.21`, `next` to `^16.2.12`, `@next/third-parties` to `16.2.12`, `lucide-react` to `^1.27.0`, `radix-ui` to `^1.6.7`, and `recharts` to `^3.10.1`. Synced the lockfile to the catalog, including prior bumps for `ai` `^7.0.37`, `@ai-sdk/openai` `^4.0.20`, `@ai-sdk/react` `^4.0.40`, `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` `3.1095.0`, `better-auth` `1.6.25`, `hono` `^4.12.32`, `next-intl` `4.13.4`, `fumadocs-core` / `fumadocs-ui` `16.12.1`, and related catalog entries. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7), `@types/uuid` (deprecated), and `@orpc/*` `1.14.10`, `@hookform/resolvers` `5.5.3`, `prisma-zod-generator` `2.8.1`, and `turbo` `2.10.7` (published within the one-day `minimumReleaseAge` window). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-26

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1095.0`, `hono` to `^4.12.32`, `@ai-sdk/anthropic` to `^4.0.20`, `dodopayments` to `^2.43.0`, `es-toolkit` to `^1.50.0`, `react-hook-form` to `^7.83.0`, and `nuqs` to `^2.9.2`. Synced the lockfile to the catalog, including prior bumps for `ai` `^7.0.37`, `@ai-sdk/openai` `^4.0.20`, `@ai-sdk/react` `^4.0.40`, `better-auth` `1.6.25`, `lucide-react` `^1.26.0`, `next-intl` `4.13.4`, `fumadocs-core` / `fumadocs-ui` `16.12.1`, and `react-email` `^6.9.1`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7), `@types/uuid` (deprecated), and `@ai-sdk/anthropic` `4.0.21` and `turbo` `2.10.7` (published within the one-day `minimumReleaseAge` window). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.23` and `@playwright/test` to `^1.62.0`.

---

## 2026-07-25

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.37`, `@ai-sdk/anthropic` to `^4.0.19`, `@ai-sdk/openai` to `^4.0.20`, `@ai-sdk/react` to `^4.0.40`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1094.0`, `better-auth` to `1.6.25`, `@better-auth/passkey` to `^1.6.25`, `lucide-react` to `^1.26.0`, `next-intl` to `4.13.4`, `use-intl` to `^4.13.4`, `openai` to `^6.49.0`, `fumadocs-core` / `fumadocs-ui` to `16.12.1`, and `react-email` to `^6.9.1`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Synced `postcss` to `8.5.22`, `radix-ui` to `^1.6.5`, and `turbo` to `^2.10.6` in the lockfile.

---

## 2026-07-24

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.35`, `@ai-sdk/openai` to `^4.0.18`, `@ai-sdk/react` to `^4.0.38`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1093.0`, `better-auth` to `1.6.24`, `@better-auth/passkey` to `^1.6.24`, `postcss` to `8.5.22`, `radix-ui` to `^1.6.5`, and `fumadocs-core` / `fumadocs-ui` to `16.12.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `turbo` to `^2.10.6`.

---

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.34`, `@ai-sdk/openai` to `^4.0.17`, `@ai-sdk/react` to `^4.0.37`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1092.0`, `next` to `^16.2.11`, `@next/third-parties` to `16.2.11`, `next-intl` to `4.13.3`, `use-intl` to `^4.13.3`, `postcss` to `8.5.21`, `react` and `react-dom` to `19.2.8`, `@tanstack/react-query` to `^5.101.4`, and `resend` to `^6.18.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.75.0`, `oxfmt` to `^0.60.0`, and `oxlint-tsgolint` to `^7.0.2001` (major upgrade).

---

## 2026-07-22

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.32`, `@ai-sdk/react` to `^4.0.35`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1091.0`, `@prisma/adapter-pg`, `@prisma/client`, and `@prisma/nextjs-monorepo-workaround-plugin` to `7.9.0`, `prisma` to `7.9.0`, `radix-ui` to `^1.6.4`, `recharts` to `^3.10.0`, `@tanstack/react-query` to `^5.101.3`, and `@polar-sh/sdk` to `^0.49.0`. Skipped `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Reverted `typescript` to `6.0.3`: Next.js 16.2.x still probes `typescript/lib/typescript.js`, which TypeScript 7 drops, so `next typegen` failed in CI and left generated route types (`PageProps`, `LayoutProps`, `RouteContext`) undefined.

---

## 2026-07-21

### Changed

#### Dependencies

- **Production dependencies**: Bumped `nuqs` to `^2.9.1`, `postcss` to `8.5.20`, and `react-dropzone` to `^19.1.1`. Skipped `radix-ui` `1.6.3` (published within the one-day `minimumReleaseAge` window) and `@types/uuid` (deprecated).
- **Development dependencies**: Kept `typescript` on `6.0.3` because Next.js 16.2.x does not yet support TypeScript 7's native package layout. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-20

### Changed

#### Dependencies

- **Production dependencies**: Bumped `hono` to `^4.12.31` and `react-dropzone` to `^19.0.2` (major upgrade: accepts in-limit files instead of rejecting the whole batch). Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-19

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.31`, `@ai-sdk/anthropic` to `^4.0.16`, `@ai-sdk/openai` to `^4.0.16`, `@ai-sdk/react` to `^4.0.34`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1090.0`, `lucide-react` to `^1.25.0`, and `react-hook-form` to `^7.82.0`. Synced the lockfile for the previous run's catalog upgrades (including `fumadocs` 16.11.5/15.2.0, `react-email` 6.9.0, `stripe` 22.3.2, and `tailwindcss` 4.3.3). Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Synced `oxlint-tsgolint` to `^0.25.0`.

---

## 2026-07-18

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.30`, `@ai-sdk/openai` to `^4.0.15`, `@ai-sdk/react` to `^4.0.33`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1089.0`, `fumadocs-core` and `fumadocs-ui` to `16.11.5`, `fumadocs-mdx` to `15.2.0`, `react-email` to `^6.9.0`, and `stripe` to `^22.3.2`. Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@tailwindcss/postcss` to `^4.3.3`, `tailwindcss` to `4.3.3`, and `oxlint-tsgolint` to `^0.25.0`.

---

## 2026-07-17

### Changed

#### Apps

- **Favicons**: Aligned the marketing and docs favicons with the updated SaaS app icon, so all shipped apps use the same rocket icon.

---

## 2026-07-16

### Fixed

- **Avatar crop dialog**: The Cropper.js canvas and shade stay inside the dialog, so resizing the crop area no longer overflows the modal. The initial crop selection covers 95% of the available area, keeping drag handles visible.

### Changed

#### Theme and UI

- **Font**: Replaced Figtree with Plus Jakarta Sans in the SaaS and marketing app layouts.
- **Color tokens**: Switched the shared theme from stone to zinc neutrals, with slate primary accents in light and dark mode (`tooling/tailwind/theme.css`).
- **Buttons**: Hover states use `color-mix` for primary/secondary/destructive; outline buttons use foreground-based borders and hover fills.
- **Dialogs and menus**: Alert dialogs use `bg-card` with larger radius; dialogs use `rounded-2xl`; dropdown menus use `rounded-xl`.
- **Logo**: Slightly smaller default logo mark (`size-8`).

#### SaaS app

- **App shell**: Removed the floating content card. Navbar and main content share one background, separated by a border; content padding aligns with the navbar.
- **Navbar collapse**: Replaced the header toggle with a Vercel-style edge drag strip (hover chip) that expands/collapses the sidebar. Active nav items use a muted background instead of a bordered card. Expanded mode shows the logo label.
- **Organization select**: Card-styled trigger with tighter padding; the dropdown uses a regular width with the trigger as min-width and opens to the right when the sidebar is collapsed. A tighter plan label line-height keeps the trigger height stable. Personal account uses a user icon (instead of the profile photo), drops the group title, and shows the “Personal account” label as the row text.
- **Organization grid**: Organization logos use rounded corners to match the refreshed cards.
- **User menu**: Dropdown uses a regular width with the trigger as min-width; opens above (expanded), to the right (collapsed desktop), or below and right-aligned (mobile).
- **Auth screens**: Removed the bordered auth card wrapper; titles and subtitles are centered. Login/signup divider labels use `bg-background`.
- **Settings**: Simplified active sessions and connected accounts rows (no bordered cards); settings item headers get consistent bottom padding on wide layouts.
- **App icon**: Updated the SaaS app icon asset.

#### Marketing

- **Hero**: Dropped the primary-tinted gradient background; the hero media frame uses `bg-muted`.
- **Consent banner**: The Allow action explicitly uses the primary button variant.

#### Database

- **Two-factor authentication**: Added `failedVerificationCount` and `lockedUntil` to the `TwoFactor` model in Prisma and the PostgreSQL, MySQL, and SQLite Drizzle schemas. Apply with your usual database push/migrate workflow.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.28`, `@ai-sdk/anthropic` to `^4.0.15`, `@ai-sdk/openai` to `^4.0.14`, `@ai-sdk/react` to `^4.0.30`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1087.0`, and `openai` to `^6.47.0`. Synced the lockfile for earlier runs' catalog upgrades (including major upgrades for `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, `cropperjs` 2.x, `nanoid` 6.x, and `react-dropzone` 17.x). Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.74.0`, `oxfmt` to `^0.59.0`, and `turbo` to `^2.10.5`.

---

## 2026-07-15

### Fixed

- Removed the stale `cropperjs/dist/cropper.css` import from the SaaS app root layout; the file no longer exists in the package (Cropper.js v2 ships its styles inside its web components), which broke the Next.js production build. Aligned the avatar crop dialog with the TanStack Start implementation, including shade clipping and layout styles for the Cropper.js v2 web component API.

### Changed

#### Mail

- **Default provider**: Switched the default mail provider export from Plunk to Resend and removed the Plunk provider and the `PLUNK_API_KEY` example environment variable.

#### Dependencies

- **Production dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.11.4`, `fumadocs-mdx` to `15.1.1`, and `react-email` to `^6.8.1`. Skipped `ai` `7.0.26`, `@ai-sdk/*` `4.0.13`/`4.0.14`/`4.0.27`, and `@aws-sdk/*` `3.1086.0` (under 24 hours old), plus `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.19`. Skipped `turbo` `2.10.5` (under 24 hours old).

---

## 2026-07-14

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@orpc/*` to `1.14.8`, `hono` to `^4.12.30`, `nanoid` to `^6.0.0`, and `react-dropzone` to `^17.0.0`. Synced the lockfile for earlier catalog upgrades (including `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x). Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.18` and `tsx` to `^4.23.1`.

---

## 2026-07-13

### Changed

#### Dependencies

- **Production dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.11.3`. Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.17`.

---

## 2026-07-12

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.22`, `@ai-sdk/anthropic` to `^4.0.12`, `@ai-sdk/react` to `^4.0.23`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1085.0`, `hono` to `^4.12.29`, `next-intl` to `4.13.2`, `use-intl` to `^4.13.2`, `fumadocs-core` / `fumadocs-ui` to `16.11.2`, and `react-email` to `^6.7.0`. Synced the lockfile for the previous run's catalog upgrades. Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxfmt` to `0.58.0`, `oxlint` to `1.73.0`, `turbo` to `2.10.4`, and `@types/node` to `26.1.1`.

---

## 2026-07-11

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.19`, `@ai-sdk/anthropic` to `^4.0.11`, `@ai-sdk/openai` to `^4.0.11`, `@ai-sdk/react` to `^4.0.20`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1084.0`, `dodopayments` to `^2.42.2`, `lucide-react` to `^1.24.0`, `openai` to `^6.46.0`, `react-email` to `^6.6.9`, and `stripe` to `^22.3.1`. Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-10

### Changed

#### Dependencies

- **Production dependencies**: Synced the lockfile with the catalog major upgrades (`ai` `^7.0.16`, `@ai-sdk/*` `^4.0.x`, `cookie` `^2.0.1`, `cropperjs` `2.1.1`, `resend` `^6.17.2`, `nodemailer` `^9.0.3`, and related packages). Bumped `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1083.0`.
- **Development dependencies**: Bumped `@types/node` to `26.1.1`. Skipped `ai` `7.0.18`, `@ai-sdk/react` `4.0.19`, `@ai-sdk/openai` `4.0.9`, and `@aws-sdk/*` `3.1084.0` (under 24 hours old). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-09

### Changed

#### Dependencies

- **Production dependencies**: Synced the lockfile with the catalog major upgrades (`ai` `^7.0.16`, `@ai-sdk/*` `^4.0.x`, `cookie` `^2.0.1`, `cropperjs` `2.1.1`, `resend` `^6.17.1`, `nodemailer` `^9.0.3`, and related packages). Bumped `dodopayments` to `^2.42.1`, `react-email` to `^6.6.8`, `fumadocs-core` / `fumadocs-ui` to `16.11.1`, and `fumadocs-mdx` to `15.1.0`.
- **Development dependencies**: Bumped `vitest` and `@vitest/coverage-v8` to `^4.1.10`, `turbo` to `^2.10.4`, `oxlint` to `^1.73.0`, and `oxfmt` to `^0.58.0`. Skipped `ai` `7.0.17`, `@ai-sdk/react` `4.0.18`, and `@aws-sdk/*` `3.1081.0` (under 24 hours old). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-08

### Changed

- **Dependabot**: Removed the `.github/dependabot.yml` configuration. Dependency updates are manual or can be automated with AI agent tools such as Cursor Automations or Claude Code Routines. `pnpm-workspace.yaml` still enforces `minimumReleaseAge: 1440` (one day) on install.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.16`, `@ai-sdk/react` to `^4.0.17`, `@orpc/*` to `1.14.7`, `hono` to `^4.12.28`, `dodopayments` to `^2.42.0`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1080.0`, and `radix-ui` to `^1.6.2`.
- **Development dependencies**: Bumped `vitest` and `@vitest/coverage-v8` to `^4.1.10`, `turbo` to `^2.10.4`, `oxlint` to `^1.73.0`, and `oxfmt` to `^0.58.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-07

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@ai-sdk/openai` to `^4.0.8`. Skipped the other available updates (`ai` 7.0.16, `@ai-sdk/react` 4.0.17, `dodopayments` 2.42.0, `hono` 4.12.28, `@aws-sdk/client-s3` 3.1080.0, `oxlint` 1.73.0, `oxfmt` 0.58.0, and `turbo` 2.10.4) as under 24 hours old. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-06

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.15`, `@ai-sdk/anthropic` to `^4.0.8`, `@ai-sdk/react` to `^4.0.16`, `react-hook-form` to `^7.81.0`, and `dodopayments` to `^2.41.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-05

### Changed

#### Dependencies

- **Production dependencies**: Bumped `recharts` to `^3.9.2` and `resend` to `^6.17.1`.
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.3.1`, `tsx` to `^4.23.0`, and `turbo` to `^2.10.3`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-04

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.14`, `@ai-sdk/anthropic` to `^4.0.7`, `@ai-sdk/openai` to `^4.0.7`, `@ai-sdk/react` to `^4.0.15`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1079.0`, and `react-email` to `^6.6.6`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `tsx` to `^4.22.5`.

---

## 2026-07-03

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.11`, `@ai-sdk/anthropic` to `^4.0.5`, `@ai-sdk/openai` to `^4.0.5`, `@ai-sdk/react` to `^4.0.12`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1078.0`, `next` to `^16.2.10`, `@next/third-parties` to `16.2.10`, `next-intl` and `use-intl` to `4.13.1`, `lucide-react` to `^1.23.0`, `nuqs` to `^2.9.0`, `radix-ui` to `^1.6.1`, `recharts` to `^3.9.1`, `nodemailer` to `^9.0.3`, and `sharp` to `^0.35.3`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@types/node` to `26.1.0`, `turbo` to `^2.10.2`, and `oxlint-tsgolint` to `^0.24.0`.

---

## 2026-07-01

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.7`, `@ai-sdk/anthropic` to `^4.0.2`, `@ai-sdk/openai` to `^4.0.3`, `@ai-sdk/react` to `^4.0.8`, Better Auth to `1.6.23`, `@better-auth/passkey` to `^1.6.23`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1076.0`, `fumadocs-core` and `fumadocs-ui` to `16.10.7`, and `tailwindcss` to `4.3.2`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.72.0`, `oxfmt` to `^0.57.0`, and `turbo` to `^2.10.1`.

---

## 2026-07-02

### Changed

#### Dependencies

- **Development dependencies**: Bumped `oxlint-tsgolint` to `0.24.0` and Turborepo to `2.10.2`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-30

### Changed

#### Dependencies

- **Production dependencies**: Major upgrades — `ai` to `^7.0.4`, `@ai-sdk/anthropic` to `^4.0.1`, `@ai-sdk/openai` to `^4.0.2`, `@ai-sdk/react` to `^4.0.5`, `cookie` to `^2.0.0`, and `cropperjs` to `2.1.1`. Replaced `react-cropper` with native Cropper.js v2 integration in the avatar crop dialog. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-30 (earlier)

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@ai-sdk/anthropic` to `^3.0.89`, `@ai-sdk/openai` to `^3.0.77`, `@ai-sdk/react` to `^3.0.216`, and `ai` to `^6.0.214`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work.
- **Development dependencies**: Bumped `@types/node` to `26.0.1` and `prettier` to `3.9.3`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-30 (earlier)

### Changed

#### Dependencies

- **Production dependencies**: Bumped `lucide-react` to `1.22.0`, `date-fns` to `4.4.0`, `openai` to `6.45.0`, `postcss` to `8.5.16`, `autoprefixer` to `10.5.2`, `uuid` to `14.0.1`, and `start-server-and-test` to `3.0.11`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work.
- **Development dependencies**: Bumped `@types/node` to `25.9.4` and `@types/js-cookie` to `3.0.6`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-29

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@tanstack/react-query` to `5.101.2`, `dodopayments` to `2.40.1`, `fumadocs-core` to `16.10.6`, `fumadocs-mdx` to `15.0.13`, and `fumadocs-ui` to `16.10.6`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-28

### Changed

#### Dependencies

- **Production dependencies**: Bumped Better Auth to `1.6.22`, `@better-auth/passkey` to `1.6.22`, `es-toolkit` to `1.49.0`, and `resend` to `6.16.0`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-26

### Changed

#### Dependencies

- **Production dependencies**: Bumped 40+ packages, including Next.js `16.2.9`, Better Auth `1.6.20`, oRPC `1.14.6`, Tailwind CSS `4.3.1`, AWS SDK S3 clients `3.1075.0`, and Radix UI `1.6.0`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work.
- **Development dependencies**: Bumped Turborepo to `2.10.0`, Oxlint to `1.71.0`, Oxfmt to `0.56.0`, Vitest to `4.1.9`, and Playwright to `1.61.1`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-22

### Changed

#### Dependencies

- **Production dependencies**: Bumped `hono` to `^4.12.25` in the catalog and lockfile, and `nodemailer` to `^9.0.1` in the mail package. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-16

### Fixes and improvements

#### SaaS app

- **Organization members**: Removed the role permissions summary box from the members settings page. Role descriptions appear only in the role select dropdown (capped to one line), and the select trigger shows just the role label.

### Changed

#### Dependencies

- **Development dependencies**: Bumped Turborepo to `2.9.18` and `@tailwindcss/typography` to `0.5.20`. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-06

### Changed

#### Dependencies

- **Production dependencies**: Bumped `cookie` from `0.7.2` to `1.1.1` (major) across the lockfile.
- **Development dependencies**: Bumped `oxlint-tsgolint` to `0.23.0`, Turborepo to `2.9.16`, and `@content-collections/core` to `0.15.1`. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-04

### Changed

#### Dependencies

- **Production dependencies**: Bumped 29 packages, including Next.js `16.2.7`, React and React DOM `19.2.7`, Better Auth `1.6.14`, Vitest `4.1.8`, and `next-intl` `4.13.0`. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-02

### Fixes and improvements

#### SaaS app

- **Organization settings**: Only organization owners see the delete organization section in general settings; admins keep access to the rest of organization settings.

---

### Removed

#### Auth

- **Username plugin**: Removed the Better Auth `username()` plugin and the `username` and `displayUsername` columns from the Prisma and Drizzle user schemas. This eliminates the unauthenticated `POST /api/auth/is-username-available` endpoint, which allowed anonymous username enumeration. Apply the schema change with `pnpm --filter @repo/database push` (drops the two columns).

---

## 2026-05-27

### Changed

#### Infrastructure

- **Node.js and pnpm**: The workspace requires Node.js `>=22` and pins `pnpm@11.3.0`. Upgraded Turborepo to the latest 2.9.x release.
- **Dependabot**: Removed the open-pull-requests limit and Dependabot cooldown, so daily upgrade PRs are no longer capped at two. `pnpm-workspace.yaml` still enforces `minimumReleaseAge: 1440` (one day) on install.
- **Lint tooling**: Moved `oxlint-tsgolint` from root dependencies to devDependencies so it installs only for development.

---

## 2026-05-25

### Fixes and improvements

#### Payments

- **Stripe one-time checkout**: Checkout links for a user or organization with an existing Stripe customer no longer send `customer_creation` alongside `customer`, which Stripe rejects as a parameter conflict.

#### Marketing and SaaS apps

- **Theme toggle**: `ColorModeToggle` defers reading `next-themes` until after mount, so the marketing and SaaS toggles render matching server markup and client hydration without `suppressHydrationWarning`; the active indicator no longer jumps or mismatches on first paint.

#### Marketing

- **Content Collections**: `content-collections` config uses the `content` option instead of the deprecated `collections` field (0.14+ migration), keeping the marketing content pipeline on the supported API.

---

## 2026-05-21

### Fixes and improvements

#### SaaS app

- **Organization members**: Role selects are ordered member → admin → owner (least to most access). The members settings page includes a role permissions summary, and each role option shows a short description of what it can do.

---

## 2026-05-20

### Removed

#### Mail

- **NewUser template**: Removed the unused `NewUser` email template, its `mailTemplates` wiring, orphaned per-locale `mail.json` entries, and the `common.otp` string used only there. Signup and email changes keep using the email verification template.

### Changed

#### Dependencies

- **Workspace prune**: Dropped direct dependencies never imported from their package trees, removed the `openapi-schema` helper that only supported the removed `openapi-merge` dependency, and refreshed the lockfile; type-check and tests still pass.

---

## 2026-05-18

### Changed

#### Mail

- **React Email 6**: The mail workspace uses the unified `react-email` package (v6), replacing the separate `@react-email/components` and `@react-email/render` dependencies. Per the v6 upgrade guide, the mail preview app replaces `@react-email/preview-server` with `@react-email/ui`. Email templates were reformatted with oxfmt.

---

## 2026-05-13

### Fixes and improvements

#### Infrastructure

- **Dependency minimum release age**: A 1-day minimum release age is enforced at two levels to reduce supply chain attack exposure. Dependabot's `cooldown: default-days: 1` delays upgrade PRs for freshly published versions, and `pnpm-workspace.yaml` sets `settings.minimumReleaseAge: 1440` (minutes) so pnpm v11+ refuses to install any package version younger than one day, including transitive dependencies. This gives the community time to detect newly published, potentially compromised versions before they reach the project.
- **pnpm v11**: The monorepo targets pnpm `11.1.1`; package-manager-only build settings moved from the root `package.json` into `pnpm-workspace.yaml` so installs and CI work on the v11 toolchain.

#### Marketing and SaaS apps

- **Theme toggle**: Light/dark controls in the marketing and SaaS apps render correct server markup and no longer rely on a client-only placeholder that hid the toggle before hydration.

---

## 2026-05-09

### Fixes and improvements

#### Database

- **Two-factor authentication schema**: Added the missing Better Auth `verified` flag to the `TwoFactor` Prisma model, the generated Prisma Zod schema, and the PostgreSQL, MySQL, and SQLite Drizzle schemas, so every database adapter represents two-factor enrollment state the same way.

---

## 2026-05-06

### Fixes and improvements

#### SaaS app

- **Account security settings**: Passkeys can be renamed from the passkey list, and the rename dialog opens automatically after creating a passkey. The list shows user-defined names without the device type prefix, falling back to “Unnamed passkey” for legacy passkeys without a saved name. The two-factor authentication block stays visible when no password is set and explains that a password is required before enabling two-factor authentication.

---

## 2026-04-24 v3.3.2

### Fixes and improvements

#### SaaS app

- **Organization general settings**: The organization name field syncs when client data loads; success and error toasts use dedicated `organizations.settings` i18n keys. After a rename, the organization list query is refetched, the active organization refreshed, and the name form reset to the saved value. The organization switcher no longer briefly shows “Personal account” when opening account settings with an active organization (the active-org query keeps previous data across route key changes).

---

## 2026-04-20 v3.3.1

### Fixes and improvements

#### Database

- **Drizzle notifications and schema**: Notification persistence (preferences, inserts, listing rows, unread counts, mark read) lives in `@repo/database` for both Prisma and Drizzle, so the Drizzle scaffold no longer mixes in Prisma-style `db` calls. The Drizzle schema barrel (`drizzle/schema/index.ts`) re-exports the PostgreSQL schema (aligned with the Drizzle client) and exposes `NotificationType` / `NotificationTarget` for type-safe consumers.
- **`user.lastActiveOrganizationId` in Drizzle**: Added to the PostgreSQL, MySQL, and SQLite user tables so Drizzle schemas match the Prisma user model and the auth hooks that read this field.
- **Organization lookups (Drizzle)**: `findFirst`-based helpers normalize missing rows to `null`, matching Prisma `findUnique` behavior for tests and callers.

#### Packages

- **`@repo/notifications`**: Dropped the thin `list`, `mark-read`, and `preferences` modules; the package index re-exports the shared notification query helpers from `@repo/database` alongside create/welcome/resolve-link.

#### API

- **Notifications procedures**: List and unread-count handlers use the database row helpers from `@repo/notifications` / `@repo/database` and apply `resolveNotificationLink` when shaping list responses.

#### SaaS app

- **Notification center**: Removed interval-based notification refetching from the notification center UI.

Related: [issue #2395](https://github.com/supastarter/supastarter-nextjs/issues/2395) (Drizzle + Postgres scaffold parity).

---

## 2026-03-30 v3.3.0

### Added

#### Database

- **Notification entity**: New `Notification` model in Prisma and Drizzle (PostgreSQL, MySQL, SQLite) with user association and read/unread state.

#### Packages

- **`@repo/notifications`**: Shared module for notification definitions (`catalog`), creating and listing notifications, marking as read, per-user preferences, and a welcome notification helper.

#### API

- **Notifications oRPC**: Procedures to list notifications, get the unread count, mark one or all as read, and read/update notification preferences.

#### SaaS app

- **Notification Center**: Navbar UI to view notifications and mark them read.
- **Notification preferences**: Account settings page and form for per-channel preferences; server-only notification logic stays out of the preferences form's client bundle.
- **Auth**: A database hook after user creation creates a welcome in-app notification via `@repo/notifications`.

#### Mail and i18n

- **`Notification` email template** and template wiring; **saas** and **mail** translation keys for notifications in English, German, Spanish, and French.

#### UI

- **Popover** and **Switch** components exported from `@repo/ui` for notification UI patterns.

### Changed

#### SaaS settings

- **Account and organization settings**: Removed nested `settings/layout.tsx` for account and org routes and updated settings sub-pages (general, billing, security, members, etc.) to the flatter structure. New **Notifications** route under account settings.

#### NavBar and theming

- **NavBar**: Reworked layout and behavior (including notification entry points); **Tailwind theme** (`tooling/tailwind/theme.css`) and related component tweaks for consistency.

---

## 2026-03-24 v3.2.0

### Testing

- **Vitest setup**: Added Vitest configuration (`vitest.config.ts`) to `apps/saas`, `apps/marketing`, and `packages/api` so each workspace package runs unit tests with `pnpm test`.
- **Unit tests**: Added initial suites covering `base-url` helpers in both apps, content utilities in the marketing app, and organization membership logic, slug generation, and oRPC procedure wiring in the API package.
- **CI integration**: Added a unit test job to the GitHub Actions workflow so unit tests run on every pull request; the Turbo `test` task no longer depends on `build`.

---

## 2026-03-24 v3.1.1

### Fixes and improvements

#### SaaS app

- **Checkout return after payment**: After Stripe checkout, users land on `/checkout-return`, which polls `listPurchases` until an active plan appears (avoiding a race with webhook processing). The pricing table passes `organizationId` in the return URL when applicable. If confirmation does not arrive before the timeout, users are sent to `/choose-plan`. Added `checkoutReturn` copy in English, German, Spanish, and French.

---

## 2026-03-23 v3.1.0

### Tooling

- **Lint and format stack**: Replaced Biome with [Oxlint](https://oxc.rs/docs/guide/usage/linter) and [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) for faster linting and formatting across the monorepo.
- **Workspace layout**: Consolidated Oxlint/Oxfmt dependencies at the repository root (pnpm catalog) and removed redundant per-package Biome configs; updated the lockfile and many source files to the new rules and formatter output.

---

## 2026-03-18 v3.0.3

### Added

#### Organizations

- **Persist last active organization**: A new `lastActiveOrganizationId` field on the user record is updated whenever the active organization changes. On the next sign-in, a better-auth `databaseHook` restores the session to that organization, so users no longer land on a default/empty organization.

---

## 2026-03-09 v3.0.2

### Fixes and improvements

#### Marketing app

- **Tailwind Typography**: Added the `@tailwindcss/typography` plugin to the marketing app so `prose` and `prose-invert` classes style content correctly (blog posts, legal pages, changelogs)
- **Page spacing**: Normalized top padding on marketing pages (blog list, blog post, changelog, contact, legal) from `pt-24 pb-16` to `py-16` for consistent vertical rhythm
- **Image hostname**: Added `picsum.photos` to the allowed remote image hostnames in `next.config.ts` for blog placeholder images

---

## 2026-03-08 v3.0.1

### Fixes and improvements

#### i18n and translation usage

- **Single `useTranslations()` per component**: Removed redundant `useTranslations()` hooks (e.g. `tSignup`, `tLogin`, `tSettings`, `tPricing`, `tActions`, `tAria`, `tAvatar`, `tOrgSettings`) across marketing and SaaS components, which use a single `t` for all translation keys.
- **Color mode labels**: Marketing and SaaS `ColorModeToggle` use the full key path `common.colorMode.${option.value}` for option labels.
- **Organization and settings keys**: `ChangeOrganizationNameForm` uses `organizations.settings.changeName.notifications.success` / `error` and `settings.save` via the shared `t`; the other organization and settings forms (delete org, logo, change email/name/password, two-factor) use the single `t` for their copy.

#### Payments and purchases

- **List purchases enrichment**: `listPurchases` (packages/api) returns each purchase with resolved `planId` and `planPrice` from the payments helper, so clients get plan data without extra lookups.
- **Purchase helper**: `createPurchasesHelper` and `getActivePlanFromPurchases` in `packages/payments` accept a `ResolvedPurchase` type (with optional `planId` and `planPrice`) and use `resolvePurchasePlan` / `resolvePurchasePlanId` to skip duplicate provider price resolution for already-enriched purchases.

#### UI

- **SaaS NavBar**: The nav link list uses `flex-nowrap`, `overflow-x-auto`, and responsive `md:overflow-visible md:flex-wrap` so links scroll horizontally on small screens and wrap on larger ones; the sidebar layout keeps `md:flex-nowrap` for the vertical nav.

---

## 2026-03-08 v3.0.0

### Major architectural changes and breaking updates

The monorepo is restructured around separate marketing and SaaS apps, with expanded localization and reworked billing configuration. The major version reflects breaking changes to app paths, imports, routes, configuration, and payment data.

#### Summary of breaking changes

- **App split**: The former `apps/web` app is split into dedicated `apps/marketing` and `apps/saas` Next.js apps
- **Route changes**: Marketing routes and SaaS auth/app routes moved into new App Router layouts and path groups
- **Config scoping**: Marketing and SaaS use app-local `config.ts`, `types.ts`, and i18n request/config helpers instead of the shared `apps/web` config
- **Payments model**: Billing uses plan-based configuration and provider `priceId` values instead of client-facing `productId`
- **Purchase schema**: Purchase `productId` is renamed to `priceId` across Prisma, Drizzle, and generated Zod schemas
- **i18n split**: Translations are split by scope (`marketing`, `saas`, `mail`, `shared`) and loaded through a new `getMessagesForLocale` helper
- **Translation key updates**: Marketing and SaaS copy uses full-length translation keys across forms, nav, pricing, settings, admin, and auth flows
- **API removals**: The contact and newsletter API routers were removed from `packages/api`
- **Mail changes**: Newsletter signup email/template support was removed, and mail rendering resolves scoped translations from `@repo/i18n`
- **UI moves**: Several SaaS-specific UI primitives moved from `@repo/ui` into `apps/saas/modules/shared`
- **Workspace tooling**: Shared dependency versions come from a pnpm catalog

#### Dedicated marketing and SaaS applications

- **New apps**: Standalone `apps/marketing` and `apps/saas` apps, each with its own `package.json`, `next.config.ts`, `tsconfig.json`, global styles, robots, layouts, config, and Playwright setup
- **Marketing app**: Public pages live in `apps/marketing`: home, blog index and post routes, changelog, contact, legal pages, sitemap generation, locale switching, and refreshed home-page sections
- **SaaS app**: Protected routes live in `apps/saas`, with separate authenticated and unauthenticated layouts, account dashboards, organization settings, onboarding, auth pages, and API routes
- **Removed**: The old combined `apps/web` app and its shared layouts, proxy, sitemap, and duplicated feature modules

**Migration steps:**

1. Update scripts, deploy targets, env vars, or local workflows that referenced `apps/web`
2. Point public-site work to `apps/marketing` and protected-product work to `apps/saas`
3. Update route assumptions for auth pages (`/login`, `/signup`, etc.) and SaaS layouts if you maintain custom links or middleware

#### Localization and content restructuring

- **Scoped translations**: Locale files are split into `packages/i18n/translations/{locale}/marketing.json`, `saas.json`, `mail.json`, and `shared.json`
- **New locales**: Spanish (`es`) and French (`fr`) join English and German
- **Typed config**: Typed i18n config/interfaces; `@repo/i18n` exports `config`, `Locale`, and scoped message types
- **Message loading**: `getMessagesForLocale(locale, scope)` merges shared messages and falls back to the default locale
- **Key normalization**: Marketing and SaaS components use explicit full-length translation keys instead of short or ambiguous key paths
- **App wiring**: Marketing and SaaS each own their locale request/update helpers and locale-aware providers

**Migration steps:**

1. Move custom translation keys into the new scoped translation files
2. Replace imports of old flat message utilities with `getMessagesForLocale`
3. Rename custom UI translation lookups that rely on old short-form key paths
4. Update code that assumed only `en` and `de` locales exist

#### Payments, auth, and data model updates

- **Plan-based checkout**: `createCheckoutLink` accepts `planId`, `type`, and optional `interval`, then resolves provider price IDs server-side
- **Payments config**: Typed plan definitions, `priceId` fields, `requireActiveSubscription`, and reusable plan lookup helpers replace the `productId` pricing config
- **Purchase queries**: `listPurchases` accepts an optional input object by default, simplifying direct server/client calls
- **Database schema**: Purchase `productId` is renamed to `priceId` in Prisma and generated validation output
- **Auth updates**: Better Auth uses the SaaS base URL, raises the minimum password length to 8, reserves `chatbot` as an organization slug, and redirects invitations to `/login` and `/signup`

**Migration steps:**

1. Rename custom purchase schema usage from `productId` to `priceId`
2. Update payment integrations to pass `planId` and `interval` instead of provider product IDs
3. Regenerate and apply database migrations if your environment still uses the old purchase column name
4. Verify `NEXT_PUBLIC_SAAS_URL` and payment provider price env vars are set for the split-app setup

#### Mail, API, and shared component cleanup

- **Removed API endpoints**: The contact and newsletter oRPC modules are deleted from `packages/api`
- **Mail package refactor**: Mail helpers moved into `packages/mail/lib`, scoped mail translation loading was added, and the newsletter signup template/export was removed
- **Marketing forms**: Contact/newsletter flows were refactored with the app split and no longer rely on the removed shared API modules
- **SaaS UI ownership**: Password input, settings list/item, page header, and related components moved into the SaaS app rather than being over-generalized in `@repo/ui`
- **Workspace cleanup**: pnpm catalog version management and refreshed package wiring across apps and packages

---

## 2026-03-05 v2.0.6

### Refactoring

#### oRPC server-side client and payments

- **Server-side oRPC**: A server-only oRPC client calls the API router directly (no HTTP) during SSR. Adds `@orpc/server` (1.13.6) to `apps/web`, a new `orpc.server.ts` that sets `globalThis.$orpcClient` via `createRouterClient(router, ...)`, and `instrumentation.ts` plus a root layout import so the server client is registered before use.
- **orpc-client**: The client throws on the server ("RPCLink is not allowed on the server side") and uses `window.location.origin` for the RPC URL; it exports `orpcClient` as `globalThis.$orpcClient ?? createORPCClient(link)` so server code uses the direct router client.
- **API**: `packages/api` exports `router`; the `payments.listPurchases` procedure returns the purchases array directly instead of `{ purchases }`.
- **Payments**: Removed `getPurchases` and `apps/web/modules/saas/payments/lib/server.ts`. The account and organization billing pages and the choose-plan page call `orpcClient.payments.listPurchases()` directly, with a plain `await` replacing `attemptAsync` (es-toolkit). The `usePurchases` hook uses `data ?? []` to match the new return shape.

---

## 2026-03-05 v2.0.5

### Fixes

#### SaaS app layout – purchase list organization scoping

- **Payments / organizations**: When redirecting unsubscribed users to the choose-plan page, `organizationId` is passed to the payments list only when organizations are enabled **and** billing is attached to the organization (`billingAttachedTo === "organization"`). Previously it was passed whenever organizations were enabled, which could scope purchase lookups by organization when billing was user-level and cause a redirect loop.

---

## 2026-03-02 v2.0.4

### Dependency updates

#### oRPC upgrade

- **@orpc packages**: Upgraded from 1.13.2 to 1.13.6 across the monorepo
- **apps/web**: `@orpc/client` to 1.13.6
- **packages/api**: `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, and `@orpc/zod` to 1.13.6

---

## 2026-02-05 v2.0.3

### Radix UI dependency consolidation

#### Unified Radix UI package migration

- **Major dependency update**: Migrated from individual `@radix-ui/react-*` packages to the unified `radix-ui` package (v1.4.3)
- **Consolidated dependencies**: 13 separate Radix UI packages become one
- **Updated all UI components** to import from the unified `radix-ui` package:
  - `accordion.tsx`: `Accordion`
  - `alert-dialog.tsx`: `AlertDialog`
  - `avatar.tsx`: `Avatar`
  - `button.tsx`: `Slot` and `Slottable`
  - `dialog.tsx`: `Dialog`
  - `dropdown-menu.tsx`: `DropdownMenu`
  - `form.tsx`: `Label` and `Slot`
  - `label.tsx`: `Label`
  - `progress.tsx`: `Progress`
  - `select.tsx`: `Select`, with icons migrated to Lucide
  - `sheet.tsx`: `Sheet`
  - `tabs.tsx`: `Tabs`
  - `tooltip.tsx`: `Tooltip`

#### Icon migration

- **Replaced Radix icons**: Migrated from `@radix-ui/react-icons` to Lucide icons
- **Features component**: Radix `MobileIcon` replaced by Lucide `SmartphoneIcon`
- **Select component**: Radix `CheckIcon` replaced by Lucide's `CheckIcon`
- Removed the `@radix-ui/react-icons` dependency

#### Package updates

- **UI package**: `packages/ui/package.json` uses the unified `radix-ui` package
- **Web app**: `apps/web/package.json` uses the unified `radix-ui` package
- **Dependencies**: Reduced from 13 Radix packages to 1

**Benefits:**

- Simpler dependency management
- Smaller bundle and faster installs
- Consistent versioning across all Radix UI components
- Easier maintenance and updates

---

## 2026-02-05 v2.0.2

### AI Chat refactoring and UI improvements

#### AI Chat simplification

- **Major refactoring**: AI chat is simplified to a streaming-only interface without chat persistence
- **Removed**: Chat storage and CRUD operations (create, list, find, update, delete, add-message procedures)
- **Removed**: The `AiChat` database model from all schemas (Prisma, Drizzle MySQL/PostgreSQL/SQLite)
- **Removed**: AI chat database queries (`ai-chats.ts` files)
- **Simplified**: The AI router exposes a single `stream` endpoint for real-time AI responses
- **Refactored**: The `AiChat` component streams without persistence, using `@ai-sdk/react`'s `useChat` hook
- **Simplified**: Chatbot pages no longer prefetch chat lists or individual chats
- **New**: A `stream-message` procedure streams AI responses without storing conversations

**Breaking changes:**

- Code using `orpcClient.ai.chats.*` endpoints must be updated
- Database migrations must drop the `ai_chat` table if it exists
- Chat history no longer persists - conversations are session-only

#### UI component improvements

- **NavBar**: Conditional bottom border when scrolled (`border-b` when `!isTop`)
- **Button component**: Removed icon opacity styling (`[&>svg]:opacity-60`) for better icon visibility
- **Global styles**: Consistent Lucide icon stroke-width (`1.75`) for better icon rendering

---

## 2026-02-05 v2.0.1

### UI component enhancements and design improvements

#### Toast component redesign

- **Major enhancement**: The toast component is redesigned with custom styling and improved UX
- Custom `Toast` component supporting types (success, error, info, warning, loading, default)
- Automatic Lucide icons for each toast type
- Helper functions: `toastSuccess`, `toastError`, `toastInfo`, `toastWarning`, `toastLoading`
- `toastPromise` handles async operations with loading/success/error states
- Type-specific border colors
- Action and cancel buttons in toasts

#### Color mode toggle redesign

- **Redesigned**: A segmented toggle-button control replaces the dropdown menu
- Sliding indicator animation for the active state
- Tooltips for each color mode option (System, Light, Dark)
- ARIA labels and pressed states for accessibility
- Translations for color mode labels (`common.colorMode.system`, `common.colorMode.light`, `common.colorMode.dark`)
- System mode icon changed from `HardDriveIcon` to `MonitorCogIcon`

#### User menu improvements

- **Simplified**: Removed the inline color mode submenu from the user menu
- Color mode uses the standalone `ColorModeToggle` component
- Cleaner menu structure with better separation of concerns

#### Component styling updates

- **Select component**: Border radius changed from `rounded-md` to `rounded-lg` to match the design system
- **SettingsItem component**: Left column widened from `280px` to `320px` for better content spacing
- **Theme colors**: Muted background changed from `#1d1e1e` to `#191b1b` for better contrast

#### Form components

- All SaaS form components use the new toast API:
  - Organization forms (Create, Change Name, Delete, Logo, Invite Member)
  - Settings forms (Change Email, Change Name, Change Password, Set Password, Delete Account, User Avatar, User Language)
  - Admin components (Organization Form, Organization List, User List)
  - Organization management components (Members List, Invitations List, Organization Select)
  - Security components (Passkeys Block, Two Factor Block, Active Sessions Block)
  - Customer Portal Button

---

## 2026-02-02 v2.0.0

### Major architectural changes and breaking updates

The major version reflects breaking architectural changes across the codebase. Existing code is updated to the new structure; custom code needs manual migration.

#### Summary of breaking changes

- **Docs application**: Moved from the web app to a standalone Next.js app (`apps/docs`)
- **UI components**: Moved from `apps/web/modules/ui/` to `packages/ui/`
- **Configuration**: Removed the centralized `config/` package; config is scoped per package
- **Shared components**: `Logo` and `Spinner` moved to `@repo/ui`
- **Mail package**: Flattened directory layout (no `src/`); Logo component and custom provider removed
- **Payments package**: Helper utilities moved from `src/lib/` to `lib/`
- **Mail preview app**: New `apps/mail-preview` app for previewing emails
- **Not-found pages**: Dedicated not-found pages for marketing and SaaS routes
- **Import paths**: Imports updated throughout the codebase (275+ files changed)

#### Dedicated docs application

**Breaking changes:**

- Removed docs routes from `apps/web/app/(marketing)/[locale]/docs/[[...path]]/`
- Removed docs API route `apps/web/app/api/docs-search/route.ts`
- Removed `apps/web/app/docs-source.ts`
- Removed all docs content from `apps/web/content/docs/` (including `getting-started/` and `index.mdx`)
- Removed the `TableOfContents` component from marketing shared components
- Removed the docs image `apps/web/public/images/docs/login.png`
- `apps/web/content-collections.ts` excludes docs content
- `apps/web/app/sitemap.ts` excludes docs routes

**New structure:**

- New `apps/docs` app, a separate Next.js app built on fumadocs (default port 3001)
- Docs content lives in `apps/docs/content/docs/`
- Uses fumadocs-ui
- Includes an AI-powered page actions component
- The docs app has its own `package.json`, `tsconfig.json`, and `next.config.ts`

**Migration steps:**

1. Migrate custom docs content to `apps/docs/content/docs/`
2. Update links to `/docs/*` routes - docs are served from the separate app
3. Remove imports of the `TableOfContents` component
4. Run `pnpm dev` in `apps/docs` to start the docs server (or `pnpm --filter @repo/docs dev`)
5. Update CI/CD pipelines that build or deploy docs

#### UI components moved to packages

UI components moved to a shared package for reuse across the monorepo.

**Breaking changes:**

- Removed all UI components from `apps/web/modules/ui/components/` (25+ components including accordion, alert, button, card, dialog, form, input, select, etc.)
- Removed `apps/web/modules/ui/lib/index.ts`
- Removed `apps/web/components.json` (shadcn config file)

**New structure:**

- New `packages/ui` package containing all UI components
- Components are imported from `@repo/ui/components/[component-name]`
- Shared utilities (like `cn`) come from `@repo/ui`
- `components.json` moved to `packages/ui/components.json`
- The package includes all Radix UI dependencies and styling utilities

**Migration steps:**

1. Update imports from `apps/web/modules/ui/components/*` to `@repo/ui/components/*`
2. Update `cn` imports from `apps/web/modules/ui` to `@repo/ui`
3. Remove references to `components.json` in the web app
4. Add `@repo/ui` as a dependency to other packages that use UI components
5. Update custom TypeScript path aliases that pointed to the old location

#### Configuration restructuring

Scoped config files replace the centralized config package for better package isolation.

**Breaking changes:**

- Removed the `config/` package entirely:
  - `config/index.ts`
  - `config/package.json`
  - `config/tsconfig.json`
  - `config/types.ts`
- Imports from `@repo/config` or `config` will fail

**New structure:**

- Each package has its own `config.ts` file:
  - `apps/web/config.ts` - Web app configuration
  - `packages/api/config.ts` - API configuration
  - `packages/auth/config.ts` - Auth configuration
  - `packages/i18n/config.ts` - i18n configuration
  - `packages/mail/config.ts` - Mail configuration
  - `packages/payments/config.ts` - Payments configuration
  - `packages/storage/config.ts` - Storage configuration
- A root `config.ts` file holds shared configuration

**Migration steps:**

1. Update imports from `@repo/config` or `config` to package-specific configs:
   - `import { config } from "@config"` for the web app
   - `import { config as i18nConfig } from "@repo/i18n/config"` for package configs
2. Update code that references the old config package structure
3. Review each package's config file for the available options
4. Update environment variable usage if the config structure changed

#### Shared components cleanup

Removed shared components that the UI package now provides.

**Breaking changes:**

- Removed `apps/web/modules/shared/components/Logo.tsx`
- Removed `apps/web/modules/shared/components/Spinner.tsx`

**Migration steps:**

1. Replace imports of `Logo` from `@shared/components/Logo` - Logo comes from `@repo/ui`
2. Replace imports of `Spinner` - use skeleton components from `@repo/ui` instead
3. Update custom code that imports these components

#### Mail package restructuring

**Breaking changes:**

- Removed `packages/mail/src/components/Logo.tsx` (use `@repo/ui` instead)
- Removed the `packages/mail/src/provider/custom.ts` provider
- Restructured the mail package directory layout:
  - `src/components/` → `components/` (PrimaryButton, Wrapper moved)
  - `src/provider/` → `provider/` (all providers moved)
  - `src/util/` → `util/` (send, templates, translations moved)
- Mail providers use the new config structure, and email templates use the new import paths

**New structure:**

- Components, providers, and utilities sit at the package root, without a `src/` directory
- New `packages/mail/config.ts` for mail configuration

**Migration steps:**

1. If mail templates use the Logo component, import it from `@repo/ui`:
   ```typescript
   import { Logo } from "@repo/ui";
   ```
2. If you use a custom mail provider, migrate to a supported provider:
   - Resend
   - Nodemailer
   - Mailgun
   - Postmark
   - Plunk
   - Console (for development)
3. Configure the mail provider in `packages/mail/config.ts`
4. Update imports from `packages/mail/src/*` to `packages/mail/*`
5. Use the `apps/mail-preview` app to preview emails during development

#### Payments package restructuring

**Breaking changes:**

- Moved `packages/payments/src/lib/customer.ts` → `packages/payments/lib/customer.ts`
- Moved `packages/payments/src/lib/helper.ts` → `packages/payments/lib/helper.ts`
- Removed the old duplicate `packages/payments/src/lib/helper.ts`
- Updated payment provider implementations (Stripe, LemonSqueezy, DodoPayments, Polar)
- Payment procedures use the new config structure

**New structure:**

- New `packages/payments/config.ts` for payment configuration

**Migration steps:**

1. Update imports from `packages/payments/src/lib/*` to `packages/payments/lib/*`
2. Configure payments in `packages/payments/config.ts`
3. Review `packages/payments/lib/` for helper functions

#### Import path updates

**Affected areas:**

- UI component imports across all modules (200+ files updated)
- Config imports throughout the codebase
- Shared component imports
- Mail template imports
- Payment provider imports

**Migration steps:**

1. Run `pnpm install` to link all workspace dependencies
2. Update custom code that uses old import paths:
   - `apps/web/modules/ui/*` → `@repo/ui/*`
   - `@repo/config` → package-specific configs
   - `@shared/components/Logo` → `@repo/ui`
3. Run type checking with `pnpm type-check` to find remaining import issues
4. Update custom scripts or build tools that reference old paths

#### Workspace configuration updates

**Breaking changes:**

- `pnpm-workspace.yaml` still references the removed `config` package - update it manually
- The workspace includes the new `apps/docs` app and `packages/ui` package

**Migration steps:**

1. Remove the `config` entry from `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - apps/*
     - packages/*
     - tooling/*
   ```
2. Run `pnpm install` to refresh workspace links
3. Verify all packages are linked with `pnpm list --depth=0`

#### Biome configuration standardization

**Changes:**

- All package-level Biome configs extend the root config with `"extends": "//"`
- Root `biome.json` holds the shared configuration
- Package-specific `biome.json` files override only when needed
- The database package excludes Prisma-generated zod files from linting

**Migration steps:**

1. Make custom Biome rules follow the new pattern:
   ```json
   {
   	"root": false,
   	"extends": "//"
   }
   ```
2. Run `pnpm format` to apply the new formatting rules
3. Run `pnpm lint` to check for linting issues under the new config

#### Package dependencies and workspace structure

**Changes:**

- Added `@repo/ui` as a workspace dependency where needed
- Updated `pnpm-lock.yaml` for the new workspace structure (2760+ lines changed)
- Removed dependencies on the deleted `config` package
- Updated every package's `package.json` to the new structure
- Added the `@repo/docs` workspace package
- Updated tooling packages (scripts, tailwind, typescript) with new dependencies
- Added new messages to i18n translations (en.json, de.json)

**Migration steps:**

1. Run `pnpm install` to link all workspace dependencies
2. Verify workspace structure with `pnpm list --depth=0`
3. Check for remaining references to `@repo/config` in `package.json` files

#### Monorepo organization improvements

**Changes:**

- Improved package boundaries, separation of concerns, isolation between apps and packages, and dependency relationships

**Benefits:**

- Better code organization and discoverability
- Clearer separation between application code and shared packages
- Easier-to-understand dependencies between packages
- Better support for independent package versioning

#### Other updates

**Documentation:**

- `agents.md` reflects the new architecture and import paths
- Coding guidelines reference the new package structure
- Import examples use the new `@repo/ui` package

**Configuration:**

- `.env.local.example` reflects the new configuration structure
- Updated environment variable documentation

**Build and deployment:**

- Updated image proxy route configuration
- `turbo.json` uses the TUI interface (`"ui": "tui"`)

**New applications:**

- `apps/docs` - Standalone fumadocs documentation app
- `apps/mail-preview` - Email preview app for development (port 3005)

**Not-found pages:**

- Dedicated `not-found.tsx` pages for marketing routes (`apps/web/app/(marketing)/[locale]/not-found.tsx`) and SaaS routes (`apps/web/app/(saas)/app/not-found.tsx`)
- Removed the `NotFound` component from marketing shared components in favor of Next.js not-found pages

**TypeScript:**

- Updated TypeScript configurations across packages
- Updated path aliases in `tsconfig.json` files
- Added type definitions for UI package exports
- Added TypeScript configs for the new apps (docs, mail-preview)

---

## 2026-01-30 v1.3.5

### Design system updates and UI improvements

#### Visual design updates

- Replaced `bg-card` with `bg-background` in navigation and the app wrapper for better contrast
- Changed the newsletter section background from `bg-primary/5` to `bg-muted`
- Removed borders from cards and dropdown menus
- Changed buttons from `rounded-md` to `rounded-full`
- Increased container max-width from `--container-6xl` to `--container-7xl`

#### Typography improvements

- Increased heading sizes across marketing pages (Hero, Features sections)
- Changed letter spacing from `-0.02em` to `-0.01em` for readability
- Added a max-width to the hero paragraph

#### Component enhancements

- Added a title field and improved layout to changelog items
- Switched the changelog section to `rounded-3xl` with a `bg-muted` background
- Updated dropdown menu border radius and shadow
- Removed the explicit border and rounded corners from the settings item component

---

## 2026-01-26 v1.3.4

### Enhanced organization dashboard with visual trend charts

The organization dashboard has interactive trend charts.

---

## 2026-01-12 v1.3.3

### Consolidated agent rules into single agents.md file

All coding agent guidelines are consolidated into one `agents.md` file in the repository root.

#### Removed files

- `claude.md` - Previous Claude-specific guide
- `.windsurfrules` - Windsurf editor rules
- `.cursor/rules/*.mdc` - All 7 Cursor IDE rule files

#### New files

- `agents.md` - 679-line guide covering:
  - Technology stack overview
  - Monorepo architecture and directory structure
  - Import conventions and path aliases
  - TypeScript best practices with code examples
  - React & Next.js patterns (Server vs Client Components)
  - API & Data Layer patterns (oRPC procedures, database queries)
  - Authentication & Authorization patterns
  - UI & Styling guidelines
  - Forms & Validation patterns
  - Internationalization
  - Configuration management
  - Tooling & Quality standards
  - Performance optimization guidelines
  - Code review checklist
- `claude.md` - Symlink to `agents.md` for Claude Code compatibility

It is the single source of truth for all AI coding agents, whatever the IDE or tool.

---

## 2026-01-10 v1.3.2

#### Package updates

- Updated ORPC packages (`@orpc/client`, `@orpc/tanstack-query`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/zod`) from `^1.11.2` to `1.13.2`

#### Code changes

- Changed the `experimental_SmartCoercionPlugin` import in `packages/api/orpc/handler.ts` to `SmartCoercionPlugin`

---

## 2026-01-02 v1.3.1

### Drizzle schema update for better-auth

Aligned all drizzle schema files with the latest better-auth version.

#### Schema updates

- **User table**: Added `displayUsername` and `twoFactorEnabled` (with a default value) fields
- **Passkey table**: Added the `aaguid` field (authenticator attestation GUID)
- **Organization table**: Made `slug` required (`notNull()`) and unique
- **Member table**: Added default `"member"` for `role` and default `cuid()` for `id`
- **Invitation table**: Added `createdAt` with a default timestamp, and default `"pending"` for `status`
- Added indexes on `invitation.organizationId` and `invitation.email`

#### Relation updates

- Added the `members` relation to `userRelations`
- Changed `invitationRelations` from `inviter` to `user` for consistency with PostgreSQL schema
- Reorganized relation definitions to match the PostgreSQL structure

---

## 2026-01-02 v1.3.0

### New design

- The UI has a new, more modern design.

---

## 2025-12-22 v1.2.12

### Fixed Prisma configuration

#### Script updates

- Removed the explicit `--schema=./prisma/schema.prisma` flag from all Prisma scripts (generate, push, migrate, studio); they use Prisma's default schema location

#### Configuration cleanup

- Moved `prisma.config.ts` to the root of the database package

---

## 2025-12-21 v1.2.11

### Update dependencies

Updated next, react and react-dom to latest.

---

## 2025-12-21 v1.2.10

### Fixed settings item component

The settings item component now applies the correct layout.

---

## 2025-12-17 v1.2.9

### Updated Prisma database push script

- Removed the deprecated `--skip-generate` flag from the database `push` script

---

## 2025-12-17 v1.2.8

### Updated dependencies

#### Prisma major version upgrade

- Updated `@prisma/client` from `6.19.0` to `7.1.0`
- Updated `prisma` from `6.19.0` to `7.1.0`
- Updated `prisma-zod-generator` from `1.32.1` to `2.1.2`

#### Prisma configuration changes

- Moved `DATABASE_URL` configuration from the `schema.prisma` datasource block to `prisma.config.ts`
- The `url` field is managed in the Prisma config file

#### Better-auth updates

- Updated `better-auth` from `1.4.4` to `1.4.7` in both web app and auth package
- Updated `@better-auth/passkey` from `^1.4.4` to `^1.4.7`

---

## 2025-12-16 v1.2.7

### TypeScript configuration improvements

#### Type safety enhancements

- Added explicit type assertions in the Creem payment provider

#### TypeScript config updates

- Added `jsx: "preserve"` to the base TypeScript configuration
- Added `DOM.Iterable` to the React library TypeScript configuration

#### Cleanup

- Removed the unused `test:webhook` script from the payments package
- Removed the unnecessary `type-check` script from the tailwind config package

---

## 2025-12-16 v1.2.6

### Updated dependencies

- Updated `next` from `16.0.7` to `16.0.10`
- Updated `react` from `19.2.1` to `19.2.3`
- Updated `react-dom` from `19.2.1` to `19.2.3`

---

## 2025-12-16 v1.2.5

### Fixed prisma-zod-generator version

Pinned `prisma-zod-generator` to `1.32.1` to block automatic upgrades to `1.32.2`, which has breaking changes and is deprecated for Prisma 6.

---

## 2025-12-05 v1.2.4

### Updated DodoPayments integration

#### SDK upgrade

- Updated `dodopayments` from `^2.5.0` to `^2.8.0`

#### Webhook improvements

- The webhook handler uses the SDK's built-in verification instead of manual signature verification
- Moved webhook secret configuration to client initialization for better security
- Updated webhook event types to match the new SDK:
  - `checkout.session.completed` → `payment.succeeded`
  - `subscription.created` → `subscription.active`
  - `subscription.cancelled` → `subscription.expired`
  - Added the `subscription.plan_changed` event
- Product ID extraction uses the new SDK's `product_cart` array

---

## 2025-12-04 v1.2.3

### Improved admin list components

#### API changes

- Changed pagination parameters from `itemsPerPage`/`currentPage` to `limit`/`offset`
- Renamed the `searchTerm` parameter to `query` across admin list endpoints
- Count functions respect search queries, so pagination totals are accurate when filtering

#### Search improvements

- **Users list**: Searches name and email (case-insensitive)
- **Organizations list**: Search is case-insensitive
- Search queries apply to both data fetching and count queries

#### UI improvements

- Replaced the loading spinner with skeleton rows matching the table structure
- Fixed pagination reset logic so the page no longer resets on initial mount
- Fixed the pagination display condition to check the total count

---

## 2025-12-03 v1.2.2

### Updated next, react and react-dom for security updates

A critical-severity vulnerability was found in react server components. We updated the related dependencies to latest to fix it.

Details: https://vercel.com/changelog/cve-2025-55182

---

## 2025-12-01 v1.2.1

### Several small type issues fixed

Fixed type issues in ForgotPasswordForm, SetPasswordForm, ChangePasswordForm, and OrganizationRoleSelect components.

---

## 2025-12-01 v1.2.0

### Better-auth 1.4 upgrade

Upgraded `better-auth` from `1.3.34` to `1.4.4`, which brings breaking changes and improvements.

#### Migration steps

1. **Update dependencies:**
   - Update `better-auth` to `1.4.4` in both `apps/web/package.json` and `packages/auth/package.json`
   - Add `@better-auth/passkey` (`^1.4.4`) to `packages/auth/package.json`

2. **Update passkey plugin imports:**
   - In `packages/auth/auth.ts`: Change `import { passkey } from "better-auth/plugins/passkey"` to `import { passkey } from "@better-auth/passkey"`
   - In `packages/auth/client.ts`: Change `passkeyClient` import from `better-auth/client/plugins` to `import { passkeyClient } from "@better-auth/passkey/client"`

3. **Update magicLink callback signature:**
   - Change the `sendMagicLink` callback from `async ({ email, url }, request)` to `async ({ email, url }, ctx)`
   - Get the request from context: `const request = ctx?.request as Request`

4. **Update database schema:**
   - Run `pnpm db:push` or create a migration to add these indexes:
     - `Session`: `@@index([userId])`
     - `Account`: `@@index([userId])`
     - `Verification`: `@@index([identifier])`
     - `Passkey`: `@@index([userId])` and `@@index([credentialID])`
     - `TwoFactor`: `@@index([secret])` and `@@index([userId])`
     - `Member`: `@@index([organizationId])` and `@@index([userId])`
     - `Invitation`: `@@index([organizationId])` and `@@index([email])`
   - Add a `createdAt DateTime @default(now())` field to the `Invitation` model

The indexes improve query performance, and the changes align with better-auth 1.4's plugin architecture, where passkey is a separate package.

---

## 2025-11-25 v1.1.4

### Fix OpenAPI schema

Custom OpenAPI endpoints are reachable through the `/api` path again.

---

## 2025-11-23 v1.1.3

### Fix active sessions block

Removing the current session from the active sessions block no longer causes a redirect loop on the login page.

---

## 2025-11-20 v1.1.2

### Fix missing organization settings item in navbar

The organization settings item was missing from the navbar when the config's `hideOrganization` option was true.

---

## 2025-11-16 v1.1.1

### Remove unnecessary font-sans variable

Removed the `--font-sans` variable from theme.css; `layout.tsx` already defines it where it imports the font and injects it into the html element.

### Updated dependencies

Updated all production and development dependencies to latest.

---

## 2025-11-12 v1.1.0

### Add claude.md file

Added a `claude.md` file to the repository root with the project's coding guidelines, which Claude Code uses to generate code.

---

## 2025-11-12 v1.0.9

### Fix passkeys reload issue

The passkeys list now reloads correctly after adding or deleting a passkey.

---

## 2025-11-12 v1.0.8

### Fix missing fields in auth schema

Added the missing `aaguid` (Passkey) and `displayUsername` (User) fields to the schema; their absence made passkey creation fail.

---

## 2025-11-12 v1.0.7

### Fixed mobile menu closing issue

The mobile menu now closes when a menu item is clicked.

---

## 2025-11-11 v1.0.6

### Fix content-collections schema

The upcoming content-collections version requires the `content` field, which was previously generated automatically.
We added it to the schema to avoid breaking changes.

### Updated production dependencies

Updated all production dependencies to latest.

### Fixed AI chat component

Fixed a validation issue in the AI chat component that made the `addMessageToChat` procedure fail.

---

## 2025-11-11 v1.0.5

### Fix formatting

Ran `pnpm format` to fix formatting.

### Updated all dependencies

Updated production and development dependencies to latest.

---

## 2025-11-08 v1.0.4

### Fixed AI chat component

Fixed a type issue in the AI chat component.

### Fixed Tailwind CSS wrapper component in mail templates

As reported in #2173, some Tailwind CSS classes were not applied correctly in the email wrapper.

### Added typescript as dev dependency to web app

This fixes the `pnpm type-check` command.

---

## 2025-11-08 v1.0.3

### Fixed schema error in addMessageToChat procedure

Fixed a schema error in the `addMessageToChat` procedure that made the OpenAPI schema invalid.

---

## 2025-11-03 v1.0.2

### Updated dependencies

---

## 2025-11-03 v1.0.1

### Updated React type definitions

Updated `@types/react` and `@types/react-dom` from 19.0.0 to 19.2.2 for the latest React 19 type definitions and fixes.

The pnpm overrides are consolidated in the root `package.json`.

### Optimized pnpm dependency installation

Added `onlyBuiltDependencies` to the pnpm settings so only the Prisma packages (`@prisma/client`, `prisma`, and `prisma-zod-generator`) are built, which avoids unnecessary rebuilds and speeds up installation.

### Added pg dependency

Added `pg` (PostgreSQL client) as a dependency for the Prisma Rust-free client; the Prisma adapter needs it for PostgreSQL connections.

---

## 2025-11-03 v1.0.0

### Prisma client migration to Rust-free client

We migrated to the Rust-free Prisma client to reduce client bundle size and improve performance.

#### Migration steps

To upgrade a supastarter project to this version, change how the prisma client is generated:

1. Update `prisma` and `@prisma/client` to the latest version.

2. In the `schema.prisma` file, change the `provider` to `prisma-client`, the `output` to `./generated` and set the `engineType` to `client`.

3. Update `packages/database/prisma/client.ts` like this:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const prismaClientSingleton = () => {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is not set");
	}

	const adapter = new PrismaPg({
		connectionString: process.env.DATABASE_URL,
	});

	return new PrismaClient({ adapter });
};

declare global {
	var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// biome-ignore lint/suspicious/noRedeclare: This is a singleton
const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
	globalThis.prisma = prisma;
}

export { prisma as db };
```

For a database other than PostgreSQL, see which adapter to use: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/no-rust-engine#3-install-the-driver-adapter

### Next.js 16 migration

To align an existing project with the Next.js 16 defaults and Supastarter conventions:

1. Upgrade `next`, `react`, and `react-dom` to their latest stable releases in both `package.json` files (`package.json` at the root and `apps/web/package.json` if it exists).

2. Rename the middleware entry point:
   - Move `apps/web/middleware.ts` to `apps/web/proxy.ts`.
   - In the renamed file, rename the exported handler from `middleware` to `export function proxy(...)`.

3. Remove the inline ESLint configuration from `apps/web/next.config.ts`

4. In the marketing docs layout `apps/web/app/(marketing)/[locale]/docs/[[...path]]/layout.tsx`, change the `DocsLayout` prop from `disableThemeSwitch` to `themeSwitch={{ enabled: true }}`.

See https://nextjs.org/docs/app/guides/upgrading/version-16 for the full migration guide (beyond the supastarter codebase).

---

### Biome 2.3 upgrade

Biome 2.3 changes how CSS files are handled and doesn't yet support the Tailwind CSS 4 config format, so update `biome.json` to ignore `globals.css` for now:

```jsonc
{
	"files": {
		"includes": [
			"**",
			"!zod/index.ts",
			"!tailwind-animate.css",
			"!!**/globals.css", // <- ignore this file
		],
	},
	"css": {
		"parser": {
			"tailwindDirectives": true, // <- enable tailwind directives parsing
		},
	},
}
```
