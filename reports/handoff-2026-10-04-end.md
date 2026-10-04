# Handoff, 2026-10-04 (end of day)

Start here in a fresh session. This replaces every earlier handoff, all deleted. Their lasting content now lives in the docs, the issues and the board.

## The goal

**The first client (one agency, one office) is live on production by 2026-10-18.** The verified tracker is **#99**. The board is GitHub project **Nhịp**: https://github.com/users/Teiger212/projects/4.

- **Views:** Epics, First Client, Backlog, Roadmap.
- **The rules:** docs/agents/issue-tracker.md. Every issue sits under an epic as a sub-issue, with a milestone; dates go on epics only.
- **Dating:** code epics are dated in days (memory: estimate-code-fast), all done by Oct 10. Week 2 is production, rehearsal and the trust gates.

## Next, in order

1. **Resume the Attio grill (epic #101).** It's the same journey as HubSpot: grill → ADR 0003 amendment → spec in #101 → tickets as sub-issues → implement test-first.
   - **The facts:** `reports/attio-research-2026-10-04.md`. It covers what carries over from the 23 HubSpot decisions, the Attio API facts, the custom-attribute direction and what's still unproven.
   - **Already decided:** the client's own free workspace; one default deal owner per office; the mock never in production for a client; HubSpot stays the demo; custom attributes created at connect (`nhip_zalo_user_id` and `nhip_thread_id` unique, thread details as columns); won and lost stay on the stage.
   - **Round 1, asked but not yet answered** (my recommendation in brackets):
     - **Q1:** inherit the HubSpot decisions unless Attio forces a change? (yes)
     - **Q2:** who enters the key? (the platform admin in Connections, as with HubSpot)
     - **Q3:** OAuth app when? (at the second agency on Attio)
     - **Q4:** Nhịp sets up the client's workspace through the API at connect, safe to repeat? (yes)
     - **Q5:** which stages are won and lost? (the admin picks them at connect, stored by stage id, defaults pre-selected)
     - **Q6:** what if the default owner leaves? (stop writing leads, show "Not in CRM yet: owner missing" until the admin re-picks; #64 retries)
     - **Q7:** testing? (recorded calls from Nhip Dev, E2E on the mock, a manual rehearsal through a tunnel, plus a recorded webhook through the real signature check)
   - **Round 2 waits on round 1.** It covers matching by phone (Attio's `phone_numbers` isn't unique, so it's search then create), which deal attributes to create, and the webhook: `record.updated` filtered to deals' stage, re-read the record, deduplicate on `Idempotency-Key` since the signature carries no timestamp, one secret per office.
   - **Prove first in Nhip Dev:** creating a webhook subscription on the free plan, any custom-attribute limit, and whether a deal can be created without an owner.
2. **#112, the release workflow,** then #113, the production smoke run. Production's first deploy waits on these and on Eyal's items below.
3. **#98:** migration lint, lock timeout, the rollback rule, and the app role `nhip_app` with its timeouts. Item 4 is verified: no timeouts in the pool config, because Neon's pooler refuses them; set them on the role.
4. Then **#85** guest-data deletion and **#84** new-message alerts, then **#64** and **#67** (the lease design is in their comments), then **#68** with **#77**, **#82**, **#96** and **#94**.

## Eyal's items (#99, week 1)

- **Zalo:** the client's OA (business verification; the longest lead time).
- **Production:**
  - choose the URL;
  - set the Production-scope env vars (none exist);
  - add the release workflow as the `production` ruleset's bypass actor;
  - create the platform admin after the first deploy.
- **The model key** (`DRAFT_API_KEY` and `DRAFT_MODEL`, set nowhere).
- **Email:** a sending domain with SPF, DKIM and DMARC.
- **PostHog:** the production project.
- **Trust gates:** the restore drill, the A05 filing with a lawyer.
- **Open:** #120 (the real material behind PRODUCT.md); #122 (rename DESIGN.md's North Star and colour names, Eyal picks).
- **The demo** (#116): on staging, Nhịp saves to more than one CRM, HubSpot and Attio. The HubSpot half is Eyal's setup steps.

## State

- **main:** the docs sweep and this handoff land in one PR. PR #115 (board docs) is open, and #27 is held. No other worktrees.
- **The main dev DB** is baselined and migrated: all 12 migrations, `officeId` on every row (#95 / PR #97, merged).
- **Neon:** production is empty (no tables). Staging has 12 migrations once `main` builds. One role, `neondb_owner`. Vercel runs on Fluid compute (verified on: `resourceConfig.fluid: true`), so #98 adds `attachDatabasePool`.
- **Attio:** the dev workspace "Nhip Dev" is live, with `ATTIO_TEST_TOKEN` in the main `.env.local`. Scopes: object configuration and records read/write, members read, webhooks read/write. Deals are on; the stages are the defaults.
- **Epics:**
  - #59 CRM seam (HubSpot), #101 Attio, #100 marketing site;
  - #103 agents answer fast, #104 offices, #105 Home, #106 pipes, #107 ship safely;
  - #108 design and polish, #109 guest data, #110 billing, #111 the record.

## Working rules (also in memory)

- **Verify before writing.** A fresh sub-agent proves every claim, and every recommendation posted to an issue or PR, including against the other recommendations in the same batch.
- **No Claude attribution** in commits, PRs, issues or comments.
- **Acceptance tests red first;** E2E-first for anything a person does.
- **Edge cases pre-MVP:** fix the cheap ones, defer the rest.
- **Name scenarios** by what they check, not by number.
- **Check a PR's state with `gh`** before saying it awaits merge.
- **Kit first:** use the kit's screens and flows; hide unused screens, never delete them.
- **Plan code in days.**
