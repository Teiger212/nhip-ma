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

### CRM demo: HubSpot (ADR 0003, decided 2026-10-03)

The demo is a round trip on Zalo (above): a guest writes, the contact and deal appear in
HubSpot, the deal is marked won there, and Nhịp's Home counts the closing. It is the demo
path only; the first client's CRM comes from intake (#128): HubSpot or Attio (below), or none. The staging end-to-end steps are #116.

- [ ] **HubSpot free account** for the demo office (free CRM, no trial clock).
- [ ] **Install the `nhip-demo` app** (`integrations/hubspot-demo-app`) on the demo portal,
      or on the test account nhip-crm-dev, and paste its token into the office's Connections
      card (built in #62 and #65; stored encrypted per office). Never paste it in chat or a
      file.
- [ ] **Webhook on deal stage changes** (#66): in `integrations/hubspot-demo-app/src/app/webhooks/webhooks-hsmeta.json`
      set `targetUrl` to `https://nhip-staging.vercel.app/webhooks/crm/hubspot` (or the
      rehearsal's tunnel URL) and upload the project again.
- [ ] **Vercel, staging, Sensitive, both together:** `HUBSPOT_APP_CLIENT_SECRET` (the app's
      client secret, from its Auth tab) and `HUBSPOT_WEBHOOK_URL`, exactly the `targetUrl`
      above. `PIPE_SECRETS_KEY` must be set too, or the token cannot be saved. Verify: mark the
      demo deal won in HubSpot, and the thread shows "Won" in Nhịp within seconds.

### Client CRM: from intake (#128), decided 2026-10-04

The first client's CRM is unknown until intake. Nhịp never sets up a third-party CRM for an
agency; with none, it goes live with no CRM connection. The mock never goes to production for a
client.

- [ ] **If HubSpot:** a production static app of Nhịp's own (a new CLI project, e.g.
      `nhip-prod`), installed in the client's portal by a user with access to it (you, added
      by their admin); production's `HUBSPOT_APP_CLIENT_SECRET` and `HUBSPOT_WEBHOOK_URL`; its
      token pasted into the office's Connections card. A second HubSpot agency needs OAuth or a
      per-office webhook secret.

**If Attio** (#101):

- [x] **Nhịp's own free dev workspace** "Nhip Dev", Deals enabled, with an API key. Done
      2026-10-04; the key is in the main checkout's `.env.local` as `ATTIO_TEST_TOKEN`.
- [ ] **The client's own free workspace**, with Deals enabled and an API key (only a workspace
      admin can create one); never paste the key in chat or a file.
- [ ] **One default deal owner per office** (e.g. the manager), chosen when the office
      connects.

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
- [ ] **Choose the production URL** (`NEXT_PUBLIC_SAAS_URL`, fixed at build time).
- [ ] **Prod env vars** (Production scope; none exist yet, #99): every staging value above,
      each with prod's own value (own Zalo app, own Meta app, own PostHog project or
      environment, a new `BETTER_AUTH_SECRET` and `PIPE_SECRETS_KEY`). `DATABASE_URL` is prod's
      pooled Neon URL as the app role `nhip_app` (#98); `DIRECT_DATABASE_URL` is its direct URL
      as `neondb_owner`. `DRAFT_API_KEY` and `DRAFT_MODEL`, set on neither staging nor prod
      yet. Never set `MOCK_CRM_WEBHOOK_SECRET` or `AUTH_TRUSTED_ORIGINS` in production.
- [ ] **Vietnam's Personal Data Protection Law:** the cross-border transfer impact
      assessment filed with the Ministry of Public Security (A05) within 60 days of the first
      transfer, naming every processor (hosting in Singapore, model providers, PostHog, the
      client's CRM, HubSpot's EU portal for the demo), confirmed with a Vietnamese lawyer. Ask
      the lawyer whether Decree 356 requires a processing-service certificate (unverified).
      Not legal advice.
- [ ] **Release workflow's identity as the bypass actor** of the `production` branch ruleset
      (24113338; none today), so only it may move the branch. The workflow is #112.
- [ ] **Restore drill** of the prod database, done once and timed.
- [ ] Optional: restrict the admin area by IP in the Vercel Firewall.
