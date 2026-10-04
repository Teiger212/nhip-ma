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

### New-message alerts (ADR 0019, #84)

Web push needs a VAPID key pair per environment: staging's and prod's are different, so a
staging device never receives prod's guests. Until they are set, alerts are logged and not
pushed, and "Turn on alerts" stays hidden.

- [ ] **Generate the pair** in your own terminal: `npx web-push generate-vapid-keys`. Don't
      paste the private key in chat or a file.
- [ ] **Vercel, staging, all three together:** `VAPID_PUBLIC_KEY` (not sensitive),
      `VAPID_PRIVATE_KEY` (Sensitive), `VAPID_SUBJECT` = `mailto:` an inbox you read (push
      services write there about abuse). Then redeploy.
- [ ] **Verify on your phones:** Android Chrome, and an iPhone with Nhịp added to the Home
      Screen (iOS 16.4+): turn alerts on in the Inbox; "Send test alert" in Settings →
      Notifications arrives; a guest message from your second Zalo account shows "<name>
      is waiting · Zalo · <language>" on the lock screen, never the text; signing out stops
      them.

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
- **Rotating `BETTER_AUTH_SECRET`** (any environment) signs everyone out and re-keys the hash
  vendor message ids are stored as (#141): a WhatsApp or Zalo retry of a message that arrived
  before the rotation is not recognised as a duplicate and is filed again. Rotate only when
  needed, ideally at a quiet hour.

## Before prod (milestone 6)

- [ ] **Nhịp's own domain**; verify it in Resend with SPF, DKIM **and DMARC**; `MAIL_FROM`
      moves to it (invitations landed in spam from `lanternroute.com`).
- [ ] **Per-office subdomains** on that domain (ADR 0018).
- [ ] **Choose the production URL** (`NEXT_PUBLIC_SAAS_URL`, fixed at build time).
- [ ] **Prod env vars** (Production scope; none exist yet, #99): every staging value above,
      each with prod's own value (own Zalo app, own Meta app, own PostHog project or
      environment, a new `BETTER_AUTH_SECRET` and `PIPE_SECRETS_KEY`, a new VAPID key pair
      with its `VAPID_SUBJECT`). `DATABASE_URL` is prod's
      pooled Neon URL as the app role `nhip_app` (#98); `DIRECT_DATABASE_URL` is its direct URL
      as `neondb_owner`. `DRAFT_API_KEY` and `DRAFT_MODEL`, set on neither staging nor prod
      yet. Never set `MOCK_CRM_WEBHOOK_SECRET` or `AUTH_TRUSTED_ORIGINS` in production.
- [ ] **Vietnam's Personal Data Protection Law:** the cross-border transfer impact
      assessment filed with the Ministry of Public Security (A05) within 60 days of the first
      transfer, naming every processor (hosting in Singapore, model providers, PostHog, the
      push services that carry alerts (Apple, Google, Mozilla, Microsoft), the client's CRM,
      HubSpot's EU portal for the demo), confirmed with a Vietnamese lawyer. Ask the lawyer
      whether an alert's guest name and language, end-to-end encrypted, change the
      assessment. Ask
      the lawyer whether Decree 356 requires a processing-service certificate (unverified).
      Not legal advice.
- [ ] **Guest-data deletion, for the lawyer** (#85, ADR 0020). Ask, before the first client's
      guests reach prod. Not legal advice.
  - **Deadlines:** Decree 356's 2 working days to reply, and 20 days to delete (30 with a
    processor). Are these right, and who answers the guest, the agency or Nhịp?
  - **Roles:** is the agency the controller and Nhịp its processor? Does the client contract
    need to say so, and who carries out a request?
  - **The CRM:** is archiving the HubSpot deal Nhịp made, and a contact Nhịp created (contacts are
    restorable for 90 days), enough, or is HubSpot's permanent GDPR delete required? Nhịp leaves
    a contact the office already had, and, when the manager unticks the box, a deal Nhịp made
    on it. Is that acceptable? A failed CRM delete is left to the manager by hand.
  - **The lead tally:** a deleted guest leaves office, first contact and first reply times,
    pipe, language and outcome, with no identifier. Is that anonymous? Must times be coarser?
  - **The receipt:** office, manager, time, row counts and the CRM result, with no guest. How
    long may it be kept?
  - **Retention:** must threads expire after a set period? Is Neon's point-in-time history
    (its window, on prod's plan) acceptable as backup retention after a deletion?
  - **Elsewhere:** what about these, and do they need naming in the A05 dossier or in a reply
    to the guest?
    - the model provider's retention (OpenRouter);
    - Vercel's request logs, whose URL paths carry the thread id, and so the guest's phone or
      Zalo id;
    - the webhook log's vendor message ids (kept about 30 days);
    - alerts already shown on operators' devices.
  - **Access:** is an export of the guest's data required before or instead of deletion? (Not
    built; #109.)
- [ ] **The release workflow's deploy key** (#112), so only `.github/workflows/release.yml`
      can move `production`. The ruleset's bypass is "Deploy keys", and the repo has none
      today, so this key is the only one. Never add a second deploy key with write access:
      the bypass covers every deploy key. Run these from any folder outside the repo:
  1. Make the key: `ssh-keygen -t ed25519 -N "" -C "nhip production release" -f nhip-release-key`.
  2. Add its public half with write access:
     `gh repo deploy-key add nhip-release-key.pub -R Teiger212/nhip-ma --allow-write --title "production release"`.
  3. Make the `release` environment: Settings → Environments → New environment `release`.
     - Under Deployment protection rules, tick Required reviewers and add yourself. GitHub
       runs the release workflow from the tagged commit, so this approval is what stops a tag
       on an edited workflow from getting the key.
     - Under Deployment branches and tags, choose Selected → Add rule → Tag `v*`.
  4. Store the private half there:
     `gh secret set PRODUCTION_DEPLOY_KEY --env release -R Teiger212/nhip-ma < nhip-release-key`.
  5. Let the key through the ruleset: Settings → Rules → Rulesets → "production: releases
     only" (24113338) → Bypass list → Add bypass → Deploy keys → Always allow.
  6. Delete both key files.
- [ ] **Immutable releases** (#112): Settings → General → Releases → enable release
      immutability. Once a release is published, its tag and assets can't be moved or
      swapped, so the commit you approved is the commit that ships (GitHub's "Immutable
      releases"; titles and notes stay editable).
- [ ] **Restore drill** of the prod database, done once and timed.
- [ ] Optional: restrict the admin area by IP in the Vercel Firewall.
