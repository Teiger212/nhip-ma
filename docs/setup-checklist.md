# Setup checklist

What Eyal fills in or verifies by hand: accounts, secrets and settings that code cannot set.
Tick an item when it is done and verified; remove it once it holds on every environment it
names. Secrets never go in this file, in chat, or in the repo: they go straight into Vercel
(Settings → Environment Variables), each scoped as stated.

Scopes: **staging** = Preview, branch `main`. **prod** = Production (branch `production`),
from milestone 6.

## Now: staging

### Migrations on build (PR #44)

- [x] **Vercel, staging, Sensitive:** `DIRECT_DATABASE_URL` = staging's direct (non-pooled)
      Neon URL. Get it with
      `neon connection-string staging --project-id lingering-bonus-85587787 --no-env-pull`
      in your own terminal and paste it into Vercel; don't paste it in chat.
- [x] **Merge #44**, then tell Claude to switch the Build Command to `pnpm run build:vercel`.
      Verify: the next staging build log shows "Applying migrations", and the staging smoke
      run passes. Done 2026-09-30: "No pending migrations to apply", smoke green.

### Zalo (ADR 0017)

- [ ] **Test OA** at oa.zalo.me, your Zalo account as admin (e.g. "Nhịp Staging Test").
- [ ] **Zalo app** at developers.zalo.me, linked to that OA. In its Official Account settings:
  - Callback URL: `https://nhip-staging.vercel.app/api/pipes/zalo/callback`
  - Webhook URL: `https://nhip-staging.vercel.app/webhooks/zalo`, event "user sends text" on
    (the webhook check may only pass once the app is deployed with the values below).
- [ ] **Vercel, staging, Sensitive, all three together:** `ZALO_APP_ID`, `ZALO_APP_SECRET`,
      `ZALO_OA_SECRET_KEY` (the OA secret key that signs webhooks).
- [ ] **Tell Claude**, who then sets `PIPE_SECRETS_KEY` (generated, never shown) and redeploys.
- [ ] **Connect:** Admin → Organizations → Test Office → Connections → Connect Zalo OA;
      approve on Zalo's screen. Verify: the OA shows "Connected".
- [ ] **Guest account:** a second Zalo account follows the OA and writes to it. Verify: the
      message appears in Test Office's inbox, translated.
- [ ] **Live sends:** tell Claude to set `SEND_MODE=live` on staging. Verify: a reply approved
      in the inbox arrives on the guest's phone.

### Error tracking (PostHog, PR #41)

- [ ] **PostHog project** "Nhịp Staging" (EU or US region).
- [ ] **In the project's settings: "Discard client IP data" on.** The one privacy setting
      code cannot make.
- [ ] **Merge #41**, then Vercel, staging, not sensitive (public by design):
      `NEXT_PUBLIC_POSTHOG_KEY` (the `phc_…` key) and `NEXT_PUBLIC_POSTHOG_HOST`
      (`https://eu.i.posthog.com` or `https://us.i.posthog.com`), then redeploy.
- [ ] **Verify:** an error shows up in PostHog → Error tracking, with no phone numbers,
      emails, message text or query strings in it.

### WhatsApp (parked until the new SIM)

- [ ] New SIM and number; Meta business account and a Meta app with WhatsApp.
- [ ] Vercel, staging, Sensitive, all three together: `WHATSAPP_APP_SECRET`,
      `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`; plus `WHATSAPP_VERIFY_TOKEN`.
- [ ] Meta webhook: `https://nhip-staging.vercel.app/webhooks/whatsapp`.

### Accounts and access

- [x] Staging platform admin created (`create:user`), passkey and 2FA on.
- [x] Resend: `RESEND_API_KEY` and `MAIL_FROM` on staging (from `lanternroute.com` for now).

## Before prod (milestone 6)

- [ ] **Nhịp's own domain**; verify it in Resend with SPF, DKIM **and DMARC**; `MAIL_FROM`
      moves to it (invitations landed in spam from `lanternroute.com`).
- [ ] **Per-office subdomains** on that domain (ADR 0018).
- [ ] **Prod env vars** (Production scope): every staging value above (including
      `DIRECT_DATABASE_URL`), each with prod's own value (own Zalo app, own Meta app, own PostHog project or environment, a new
      `BETTER_AUTH_SECRET` and `PIPE_SECRETS_KEY`, prod Neon branch `DATABASE_URL`).
- [ ] **Vietnam's Personal Data Protection Law:** the cross-border transfer impact
      assessment filed with the Ministry of Public Security (A05) within 60 days of the first
      transfer (hosting in Singapore, model providers, PostHog), confirmed with a Vietnamese
      lawyer. Not legal advice.
- [ ] **Release workflow's exemption** in the `production` branch ruleset (only it may move
      the branch).
- [ ] **Restore drill** of the prod database, done once and timed.
- [ ] Optional: restrict the admin area by IP in the Vercel Firewall.
