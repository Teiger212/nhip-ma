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

### The app's database role (#98)

The app gets its own Neon role, `nhip_app`: rows only, and the server timeouts Neon's pooler
won't take from the app (`statement_timeout` 25s, `idle_in_transaction_session_timeout` 30s).
Migrations keep `neondb_owner` on `DIRECT_DATABASE_URL`. Run these from the repo root; never
paste the password in chat or a file.

- [ ] **Password,** in your own terminal:
      `export NHIP_APP_PASSWORD="$(openssl rand -base64 30 | tr '+/' '-_')"` (URL-safe).
- [ ] **Create the role on staging:**
      `psql "$(neon connection-string staging --role-name neondb_owner --project-id lingering-bonus-85587787 --no-env-pull)" -v app_password="$NHIP_APP_PASSWORD" -f packages/database/sql/app-role.sql`.
      It runs as `neondb_owner` over the direct URL, and is safe to run again.
- [ ] **Vercel, staging, Sensitive:** `DATABASE_URL` = staging's pooled URL as `nhip_app`. Take
      `neon connection-string staging --pooled --role-name neondb_owner --project-id lingering-bonus-85587787 --no-env-pull`
      and replace `neondb_owner:<its password>` with `nhip_app:$NHIP_APP_PASSWORD`. Leave
      `DIRECT_DATABASE_URL` as it is. Redeploy.
- [ ] **Restart staging's compute** (Neon console → Branches → staging → Computes → Restart): a
      role setting reaches only new server connections.
- [ ] **Verify** over the app's own URL:
      `psql "<staging DATABASE_URL>" -c 'show statement_timeout' -c 'show idle_in_transaction_session_timeout'`
      prints `25s` and `30s`. Then the staging smoke run passes, you can sign in, and, once Zalo
      is connected, a Zalo token refresh still completes (the OA stays Connected past its
      token's expiry).
- [ ] **Verify the migration lock timeout on staging.** In one terminal, hold a lock:
      `psql "<staging direct URL>"`, then `begin; select 1 from "rateLimit" limit 1;` and leave
      it open. In a second, the same URL with the build's option added
      (`&options=-c%20lock_timeout%3D5s`):
      `psql "<that URL>" -c 'begin; lock table "rateLimit" in access exclusive mode; rollback;'`
      must fail after about 5s with "canceling statement due to lock timeout" (it changes
      nothing either way). Type `rollback;` in the first terminal. The next green staging build
      shows the build side: `migrate deploy` connects with the option even with nothing pending.
- [ ] **Restore window:** Neon console → project settings → Instant restore shows 6 hours (the
      API said 21600s on 2026-10-04). AGENTS.md ("Rolling back after a migration") relies on it.

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
- [ ] **Verify on your phones** (#134, Q5; needs #135's "Turn on alerts" and "Send test
      alert" on staging). On Android Chrome, and on an iPhone with Nhịp added to the Home
      Screen (iOS 16.4+), each: - turn alerts on in the Inbox; - "Send test alert" in Settings → Notifications arrives; - a real guest message from your second Zalo account shows "<name> is waiting · Zalo ·
      <language>" on the lock screen, never the text; - signing out on that phone stops them.

### The greeting's model (ADR 0021)

Until `DRAFT_*` is set, every automatic greeting is the fixed template, so nothing here blocks
go-live.

- [ ] **Choose a model that neither trains on nor keeps guests' text.** WhatsApp's Business
      Solution Terms 4.7 apply. On OpenRouter, every model call (greeting, translation,
      follow-up) asks for zero-retention endpoints only, with
      `provider: { zdr: true, data_collection: "deny" }`. In OpenRouter's model list, filter
      to models with a ZDR endpoint. Another provider needs a written zero-retention or
      no-training term.
- [ ] **Run the greeting test set** (first messages in EN, VI, JA, KO, RU, from the
      greeting ticket) on the cheapest candidates. Keep the cheapest one whose replies all
      pass the post-check and read well to you. If none passes, tell Claude before relaxing
      to `data_collection: "deny"` alone.
- [ ] **Vercel, staging:** `DRAFT_API_KEY` (Sensitive) and `DRAFT_MODEL`. Then redeploy. This
      also turns on the model's translations and follow-ups (ADR 0005, ADR 0007).
- [ ] **Verify from your second Zalo account:** a first message gets the auto-reply within
      seconds, with the label naming the office, and its badge says "Model".

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
- [ ] **Production's app role** (#98): the staging steps under "The app's database role", on
      branch `production` and with a new password, before the first release. Run
      `app-role.sql` again after the first release has migrated the empty branch: that run
      takes the app's access to `_prisma_migrations` away.
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
    - Vercel's request logs, whose URL paths carry the thread id (opaque since #141: no phone
      or Zalo id, but it names a guest who is now deleted);
    - the webhook log's vendor message ids (kept about 30 days);
    - alerts already shown on operators' devices.
  - **Access:** is an export of the guest's data required before or instead of deletion? (Not
    built; #109.)
- [ ] **The automatic greeting, for the lawyer** (ADR 0021). Ask before the first client's
      guests reach prod. Not legal advice.
  - **AI Law 134/2025, Art 11(1)** (in force 1 March 2026): a system interacting with people
    must be recognisable as one. Is Nhịp the provider, the agency the deployer, or both? Does
    the always-on label ("Auto-reply from <office>: a colleague will continue with you right
    here") meet it, or must it say "AI-assisted auto-reply"? First line or last?
  - **Medium-risk classification:** with the label, is the greeting outside medium risk? If
    not, what goes in the dossier, and who files the notice to the Ministry of Science and
    Technology, and when?
  - **Decree 356, Art 10(3):** the privacy notice covering automated processing and the
    opt-out. Who writes it (the agency, as controller?), where it's linked (the agency's Zalo
    OA and WhatsApp profile), and how a guest opts out. Does it go on the A05 list too?
  - **WhatsApp and Zalo:** WhatsApp has no disclosure rule but needs a clear path to a human;
    Zalo bans misleading messages. Does the label satisfy both?
  - **The model provider:** with zero-retention routing, is OpenRouter (and the endpoint
    behind it) still a processor to name in the A05 dossier?
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
- [ ] **Production smoke as a Vercel Deployment Check** (#113). Vercel keeps each production
      deployment off the domain until `.github/workflows/production-smoke.yml` passes on it.
  - [x] **Plan:** the team is on Pro, and Deployment Checks are under Project → Settings →
        Build and Deployment → Deployment Checks. Vercel's Lint and TypeCheck are already on
        there for Preview and Production. Checked 2026-10-04.
  - [ ] **Automatic production aliasing on:** Settings → Environments → Production. The
        project reads `autoAssignCustomDomains: true` (2026-10-04); confirm it in the UI.
        Deployment Checks hold nothing without it.
  - [x] **Deployment Protection is off** on the project (no Vercel Authentication or
        password; read 2026-10-04), so production's own deployment URLs are public and the
        smoke run needs no bypass secret. If you ever turn protection on (Standard Protection
        covers production's deployment URLs), first create a Protection Bypass for
        Automation (Settings → Deployment Protection) and store it as the GitHub secret
        `VERCEL_AUTOMATION_BYPASS_SECRET`, then tell Claude to send it as the
        `x-vercel-protection-bypass` header. Until then every release would be held, since the
        smoke fails on Vercel's login wall.
  - [ ] **The production URL** as a repository variable. The release run then waits until
        that domain serves the release. Without it, the run stops at "smoke passed" and says
        the domain wasn't checked:
        `gh variable set PRODUCTION_URL -R Teiger212/nhip-ma --body https://<domain>`. Until
        the custom domain exists, use production's `.vercel.app` alias (Vercel → the
        production deployment → Domains), and switch it when the domain is added.
  - [ ] **After this merges:** the next staging deploy starts a "Production smoke" run in
        Actions, with its job skipped (staging is not production). That proves Vercel sends
        its `repository_dispatch` events to this repo. If no run appears, check Vercel →
        Settings → Git.
  - [ ] **After the first production deployment** (the first release, #99): check its
        "Production smoke" run passed and its commit shows the status
        `Production smoke | production-smoke (nhip - production)`. Then Deployment Checks →
        Add Checks → GitHub → pick that name exactly, for Production. Don't pick the bare
        job "production smoke": a dispatched run's check run is filed on whatever commit
        `main`'s head is when Vercel's event arrives, not on the deployed commit. That's why
        Vercel's docs say to report through the commit status. Vercel only lists a check that
        has run once, so the first release isn't held by it.
  - [ ] **Prove a failure holds**, before go-live, with a real release of a fresh commit:
    1. `gh variable set PRODUCTION_SMOKE_FORCE_FAIL -R Teiger212/nhip-ma --body true`.
    2. Release a commit that has never been released (merged to `main`, staged and smoked):
       `gh release create vX.Y.Z --target <sha> --generate-notes`, and approve it.
    3. Check that its Production smoke run fails, that Vercel shows the deployment held,
       that the domain keeps serving the previous release, and that the release run fails
       with the smoke message.
    4. `gh variable delete PRODUCTION_SMOKE_FORCE_FAIL -R Teiger212/nhip-ma`, then re-run
       the failed Production smoke job. Check that the deployment is promoted and the
       domain serves it.
    5. Note what you saw on #113.

    Don't use a Redeploy in Vercel for this. It reuses a commit that already has a
    `success` status under the same name, and Vercel may read that status before the new
    run marks it pending, so the deployment could be promoted without proving anything.

  - [ ] **Force Promote** (on a deployment's page in Vercel) skips every check. It's for
        emergencies only.
- [ ] **Restore drill** of the prod database, done once and timed.
- [ ] Optional: restrict the admin area by IP in the Vercel Firewall.
